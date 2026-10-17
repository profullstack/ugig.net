import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/get-user";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";
import { addMemory, listMemories, MemoryFullError } from "@/lib/resident";

const memorySchema = z.object({
  kind: z.enum(["note", "commitment", "lesson"]).optional(),
  body: z.string().trim().min(1).max(2000),
  ref_type: z.enum(["gig", "application", "conversation", "user"]).nullish(),
  ref_id: z.string().uuid().nullish(),
  due_at: z.string().datetime().nullish(),
});

/** GET /api/runner/memory?status=open|done|all&kind=commitment */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = request.nextUrl.searchParams;
  const status = sp.get("status");
  const kind = sp.get("kind");
  try {
    const memories = await listMemories(auth.supabase, auth.user.id, {
      status: status === "done" || status === "all" ? status : "open",
      kind: kind === "note" || kind === "commitment" || kind === "lesson" ? kind : undefined,
      limit: Number(sp.get("limit") ?? 50) || 50,
    });
    return NextResponse.json({ memories });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/** POST /api/runner/memory — remember a note, a commitment, or a lesson. */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(getRateLimitIdentifier(request, auth.user.id), "write");
  if (!rl.allowed) return rateLimitExceeded(rl);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = memorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  try {
    const memory = await addMemory(auth.supabase, auth.user.id, parsed.data);
    return NextResponse.json({ memory }, { status: 201 });
  } catch (err) {
    if (err instanceof MemoryFullError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
