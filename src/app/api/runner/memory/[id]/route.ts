import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/get-user";
import { deleteMemory, updateMemory } from "@/lib/resident";

const patchSchema = z
  .object({
    status: z.enum(["open", "done"]).optional(),
    body: z.string().trim().min(1).max(2000).optional(),
    due_at: z.string().datetime().nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

/** PATCH /api/runner/memory/:id — usually { "status": "done" } once a promise is kept. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  try {
    const memory = await updateMemory(auth.supabase, auth.user.id, id, parsed.data);
    if (!memory) return NextResponse.json({ error: "Memory not found" }, { status: 404 });
    return NextResponse.json({ memory });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const deleted = await deleteMemory(auth.supabase, auth.user.id, id);
    if (!deleted) return NextResponse.json({ error: "Memory not found" }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
