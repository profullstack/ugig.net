import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applicationStatusSchema } from "@/lib/validations";

// PUT /api/applications/[id]/status - Update application status
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validationResult = applicationStatusSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { status } = validationResult.data;

    // Get application with gig info
    const { data: application } = await supabase
      .from("applications")
      .select(
        `
        *,
        gig:gigs (
          id,
          title,
          poster_id
        )
      `
      )
      .eq("id", id)
      .single();

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Check permissions
    const isApplicant = application.applicant_id === user.id;
    const isPoster = application.gig?.poster_id === user.id;

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
    }

    return NextResponse.json({ application: updatedApplication });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
