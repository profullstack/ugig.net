import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { applicationStatusSchema } from "@/lib/validations";
import { getUserDid, onHired } from "@/lib/reputation-hooks";

// PUT /api/applications/[id]/status - Update application status
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const body = await request.json();
    const validationResult = applicationStatusSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { status } = validationResult.data;

    // First get the application with gig_id to check ownership
    const { data: application, error: selectError } = await supabase
      .from("applications")
      .select("*, gig_id, applicant_id")
      .eq("id", id)
      .single();

    if (selectError || !application) {
      console.error("Error fetching application:", {
        error: selectError,
        applicationId: id,
        userId: user.id,
        authMethod: user.authMethod,
      });
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Get gig to verify poster ownership
    const { data: gig } = await supabase
      .from("gigs")
      .select("id, title, poster_id, poster:profiles!poster_id(full_name, username)")
      .eq("id", application.gig_id)
      .single();

    // Check permissions
    const isApplicant = application.applicant_id === user.id;
    const isPoster = gig?.poster_id === user.id;

    // Applicants can only withdraw
    if (isApplicant && status !== "withdrawn") {
      return NextResponse.json(
        { error: "You can only withdraw your application" },
        { status: 403 }
      );
    }

    // Only poster can change other statuses
    if (!isApplicant && !isPoster) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Update status
    const { data: updatedApplication, error } = await supabase
      .from("applications")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Track reputation for hired applicant
    if (status === "accepted") {
      const userDid = await getUserDid(supabase, application.applicant_id);
      if (userDid) {
        onHired(userDid, application.gig_id);
      }
    }

    // Notify applicant of status change (if changed by poster)
    if (isPoster && !isApplicant) {
      await supabase.from("notifications").insert({
        user_id: application.applicant_id,
        type: "application_status",
        title: "Application status updated",
        body: `Your application has been ${status}`,
        data: {
          gig_id: application.gig_id,
          application_id: id,
          status,
        },
      });

      // Note: Email notifications require applicant email from auth.users
      // which isn't accessible via RLS. Consider using a webhook or edge function
      // to send email notifications in the future.
    }

    return NextResponse.json({ application: updatedApplication });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
