import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, createServiceClient } from "@/lib/auth/get-user";
import { HELD_COLUMN } from "@/lib/limits";
import { emailApplicantsAboutStatusInBackground } from "@/lib/application-emails";

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
      .select("poster_id, title, poster:profiles!poster_id(full_name, username)")
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
      .select("id, applicant_id");

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Email each accepted applicant (gated on email_application_status).
    const poster = Array.isArray(gig.poster) ? gig.poster[0] : gig.poster;
    emailApplicantsAboutStatusInBackground(
      (data ?? []).map((app) => ({
        applicationId: app.id,
        applicantId: app.applicant_id,
        gigId,
        gigTitle: gig.title || "a gig",
        posterName: poster?.full_name || poster?.username || "The client",
        status: "accepted",
      }))
    );

    return NextResponse.json({ approved: (data ?? []).length });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
