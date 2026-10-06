import { NextRequest, NextResponse } from "next/server";
import { isEmailNotificationEnabled } from "@/lib/notification-settings";
import { getAuthContext, createServiceClient } from "@/lib/auth/get-user";
import { z } from "zod";
import { dispatchWebhookAsync } from "@/lib/webhooks/dispatch";
import { sendEmail, gigFilledEmail } from "@/lib/email";
import { HIRED_APPLICATION_STATUSES } from "@/lib/application-status";
import { checkForHireAdActivation, computeExpiresAt, limitResponse } from "@/lib/limits";
import { rejectOpenApplications } from "@/lib/application-resolution";
import { emailApplicantsAboutStatusInBackground } from "@/lib/application-emails";
import { getGigPostAllowance, recordGigPost, GIG_POST_LIMIT_MESSAGE } from "@/lib/gig-usage";

const statusUpdateSchema = z.object({
  status: z.enum(["draft", "active", "paused", "closed", "filled"]),
});

// PATCH /api/gigs/[id]/status - Update gig status
export async function PATCH(
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

    // Check ownership and get current status
    const { data: existingGig } = await supabase
      .from("gigs")
      .select("poster_id, status, created_at, title, listing_type, poster:profiles!poster_id(full_name, username)")
      .eq("id", id)
      .single();

    if (!existingGig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }

    if (existingGig.poster_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const validationResult = statusUpdateSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const newStatus = validationResult.data.status;
    const oldStatus = existingGig.status;

    const isActivation = newStatus === "active" && oldStatus !== "active";

    // An ad going live is held to the same caps as a new one (PRD 03).
    if (isActivation && existingGig.listing_type === "for_hire") {
      const activation = await checkForHireAdActivation(
        supabase,
        user.id,
        existingGig.title || "",
        id
      );
      if (!activation.ok) return limitResponse(activation);
    }

    // Publishing a draft or re-activating a gig counts against the free cap
    if (isActivation) {
      const allowance = await getGigPostAllowance(supabase, user.id);
      if (!allowance.allowed) {
        return NextResponse.json({ error: GIG_POST_LIMIT_MESSAGE }, { status: 403 });
      }
    }

    // Update the status
    const { data: gig, error } = await supabase
      .from("gigs")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
        // Re-activating restarts the listing window, so a gig the expiry cron
        // paused is not paused again on its next run.
        ...(isActivation ? { expires_at: computeExpiresAt(existingGig.listing_type) } : {}),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (isActivation) {
      await recordGigPost(supabase, user.id);
    }

    // Dispatch webhook for gig status change
    dispatchWebhookAsync(user.id, "gig.update", {
      gig_id: id,
      old_status: oldStatus,
      new_status: newStatus,
    });

    // Closing or filling a gig resolves its open applications: everything
    // still pending/reviewing/shortlisted becomes rejected with a reason, so
    // applicants are not left waiting on a gig that is gone. The DB trigger
    // notifies each one in-app; the email below is gated per applicant.
    let resolvedApplications = 0;
    if (
      (newStatus === "closed" || newStatus === "filled") &&
      oldStatus !== newStatus
    ) {
      try {
        const resolved = await rejectOpenApplications(
          supabase,
          id,
          newStatus === "filled" ? "gig_filled" : "gig_closed"
        );
        resolvedApplications = resolved.length;
        const poster = existingGig.poster as { full_name: string | null; username: string | null } | null;
        emailApplicantsAboutStatusInBackground(
          resolved.map((app) => ({
            applicationId: app.id,
            applicantId: app.applicant_id,
            gigId: id,
            gigTitle: existingGig.title || "a gig",
            posterName: poster?.full_name || poster?.username || "The client",
            status: "rejected",
          }))
        );
      } catch (err) {
        console.error("[gig-status] failed to resolve open applications:", err);
      }
    }

    // Send email when gig is filled
    if (newStatus === "filled" && oldStatus !== "filled") {
      // Get count of accepted applications
      const { count: hiredCount } = await supabase
        .from("applications")
        .select("*", { count: "exact", head: true })
        .eq("gig_id", id)
        .in("status", HIRED_APPLICATION_STATUSES);

      // Get poster email
      const adminClient = createServiceClient();
      const { data: posterAuth } = await adminClient.auth.admin.getUserById(user.id);
      const posterEmail = posterAuth?.user?.email;

      const poster = existingGig.poster as { full_name: string | null; username: string | null } | null;

      if (
        posterEmail &&
        (await isEmailNotificationEnabled(adminClient, user.id, "email_gig_updates"))
      ) {
        void sendEmail({
          to: posterEmail,
          ...gigFilledEmail({
            posterName: poster?.full_name || poster?.username || "there",
            gigTitle: existingGig.title || "Your gig",
            gigId: id,
            hiredCount: hiredCount || 0,
          }),
          unsubscribe: { userId: user.id, setting: "email_gig_updates" },
        });
      }
    }

    return NextResponse.json({ gig, resolved_applications: resolvedApplications });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
