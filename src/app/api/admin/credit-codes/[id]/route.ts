import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getCreditDeps } from "@/lib/credits";

/** DELETE /api/admin/credit-codes/:id: revoke a code (idempotent). */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { id } = await params;
  try {
    await getCreditDeps().credits.revoke(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Code not found" }, { status: 404 });
  }
}
