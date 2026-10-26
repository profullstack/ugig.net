import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { InviteError, revokeInvite } from "@/lib/credits";

/** DELETE /api/invites/:id: withdraw an unused invite; its slot is refunded. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    await revokeInvite(auth.user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof InviteError) {
      return NextResponse.json({ error: err.message, reason: err.reason }, { status: err.status });
    }
    console.error("[invites] revoke failed:", err);
    return NextResponse.json({ error: "Could not withdraw the invite" }, { status: 500 });
  }
}
