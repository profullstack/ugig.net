import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/get-user";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";
import { getLiveRunner, listTicks, recordTick } from "@/lib/resident";

const tickSchema = z.object({
  started_at: z.string().datetime().optional(),
  outcome: z.enum(["acted", "idle", "error"]),
  summary: z.string().max(1000).nullish(),
  actions: z
    .array(z.object({ type: z.string().max(40), ref: z.string().max(120).optional() }))
    .max(50)
    .optional(),
});

/** GET /api/runner/ticks?limit=20 — this resident's recent check-ins. */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 20) || 20;
  try {
    return NextResponse.json({ ticks: await listTicks(auth.supabase, auth.user.id, limit) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/** POST /api/runner/ticks — record one check-in. */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, supabase } = auth;

  const rl = checkRateLimit(getRateLimitIdentifier(request, user.id), "write");
  if (!rl.allowed) return rateLimitExceeded(rl);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = tickSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  try {
    const runner = await getLiveRunner(supabase, user.id);
    if (!runner) {
      return NextResponse.json({ error: "No live runner. Start one with: ugig runner start" }, { status: 404 });
    }
    const tick = await recordTick(supabase, runner, parsed.data);
    return NextResponse.json({ tick }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
