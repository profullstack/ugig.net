import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, createServiceClient } from "@/lib/auth/get-user";
import { HELD_COLUMN } from "@/lib/limits";

// POST /api/gigs/[id]/applications/approve-all
// Approves all pending applications for a gig in one shot.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gigId } = await params;
    const auth = await getAuthContext(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { user } = auth;

    const svc = createServiceClient();

    // Verify the caller is the gig poster
    const { data: gig } = await svc
      .from("gigs")
      .select("poster_id")
      .eq("id", gigId)
      .single();

    if (!gig) return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    if (gig.poster_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Bulk-update all pending applications to accepted
    const { data, error } = await svc
      .from("applications")
      .update({ status: "accepted" })
      .eq("gig_id", gigId)
      .eq("status", "pending")
      .is(HELD_COLUMN, null)
      .select("id");

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ approved: (data ?? []).length });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
