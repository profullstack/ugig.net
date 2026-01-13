import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const bulkStatusSchema = z.object({
  application_ids: z.array(z.string().uuid()).min(1).max(50),
  status: z.enum([
    "pending",
    "reviewing",
    "shortlisted",
    "rejected",
    "accepted",
  ]),
});

// PUT /api/applications/bulk-status - Bulk update application statuses
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validationResult = bulkStatusSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { application_ids, status } = validationResult.data;

    // Get all applications with gig info to verify ownership
    const { data: applications, error: fetchError } = await supabase
      .from("applications")
      .select(
        `
        id,
        applicant_id,
        gig_id,
        gig:gigs (
          id,
          poster_id
        )
      `
      )
      .in("id", application_ids);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 400 });
    }

    if (!applications || applications.length === 0) {
      return NextResponse.json(
        { error: "No applications found" },
        { status: 404 }
      );
    }

    // Verify user owns all the gigs these applications belong to
    const unauthorizedApplications = applications.filter(
      (app) => (app.gig as { poster_id: string })?.poster_id !== user.id
    );

    if (unauthorizedApplications.length > 0) {
      return NextResponse.json(
        {
          error:
            "You can only update applications for your own gigs",
        },
        { status: 403 }
      );
    }

    // Update all applications
    const { data: updatedApplications, error: updateError } = await supabase
      .from("applications")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .in("id", application_ids)
      .select();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    // Create notifications for all applicants
    const notifications = applications.map((app) => ({
      user_id: app.applicant_id,
      type: "application_status" as const,
      title: "Application status updated",
      body: `Your application has been ${status}`,
      data: {
        gig_id: app.gig_id,
        application_id: app.id,
        status,
      },
    }));

    await supabase.from("notifications").insert(notifications);

    return NextResponse.json({
      updated: updatedApplications?.length || 0,
      applications: updatedApplications,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
