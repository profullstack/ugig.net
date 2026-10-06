import { NextRequest, NextResponse } from "next/server";
import { applicationSchema } from "@/lib/validations";
import { notifyPosterOfNewApplicationInBackground } from "@/lib/application-emails";
import { getAuthContext } from "@/lib/auth/get-user";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";
import { dispatchWebhookAsync } from "@/lib/webhooks/dispatch";
import { getUserDid, onApplicationSubmitted } from "@/lib/reputation-hooks";
import { logActivity } from "@/lib/activity";
import { usersAreBlocked } from "@/lib/blocks";
import { checkApplicationLimits, heldMetadata, limitResponse } from "@/lib/limits";

// POST /api/applications - Submit an application
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const rl = checkRateLimit(getRateLimitIdentifier(request, user.id), "write");
    if (!rl.allowed) return rateLimitExceeded(rl);

    let body: unknown;
    try {
      const text = await request.text();
      if (!text || text.trim().length === 0) {
        return NextResponse.json({ error: "Request body is required" }, { status: 400 });
      }
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const validationResult = applicationSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { gig_id, ...applicationData } = validationResult.data;

    // Check if gig exists and is active, fetch poster info for email
    const { data: gig } = await supabase
      .from("gigs")
      .select("poster_id, status, title, poster:profiles!poster_id(full_name, username)")
      .eq("id", gig_id)
      .single();

    if (!gig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }

    // Normalize poster data
    const poster = Array.isArray(gig.poster) ? gig.poster[0] : gig.poster;

    if (gig.status !== "active") {
      return NextResponse.json(
        { error: "This gig is no longer accepting applications" },
        { status: 400 }
      );
    }

    // Can't apply to own gig
    if (gig.poster_id === user.id) {
      return NextResponse.json(
        { error: "You cannot apply to your own gig" },
        { status: 400 }
      );
    }

    // An application emails the poster and opens a thread with them, so a block
    // has to stop it the same way it stops a DM.
    if (await usersAreBlocked(supabase, user.id, gig.poster_id)) {
      return NextResponse.json(
        { error: "You cannot apply to this gig" },
        { status: 403 }
      );
    }

    // Check if already applied
    const { data: existingApplication } = await supabase
      .from("applications")
      .select("id, status, metadata")
      .eq("gig_id", gig_id)
      .eq("applicant_id", user.id)
      .single();

    // A withdrawn application may be resubmitted. Any other existing status
    // (pending/reviewing/shortlisted/accepted/rejected) still blocks re-applying.
    if (existingApplication && existingApplication.status !== "withdrawn") {
      return NextResponse.json(
        { error: "You have already applied to this gig" },
        { status: 400 }
      );
    }

    // Daily cap, duplicate cover letter, and the spam hold (PRD 02).
    const limits = await checkApplicationLimits(
      supabase,
      user.id,
      applicationData.cover_letter,
      { excludeApplicationId: existingApplication?.id }
    );
    if (!limits.ok) return limitResponse(limits);
    const held = heldMetadata(limits.held);

    // Create the application, or re-activate a withdrawn one. The
    // UNIQUE(gig_id, applicant_id) constraint means a prior withdrawn row must
    // be updated in place rather than inserted a second time.
    const { data: application, error } = existingApplication
      ? await supabase
          .from("applications")
          .update({
            ...applicationData,
            status: "pending",
            updated_at: new Date().toISOString(),
            ...(held
              ? {
                  metadata: {
                    ...((existingApplication.metadata as Record<string, unknown> | null) ?? {}),
                    ...held,
                  },
                }
              : {}),
          })
          .eq("id", existingApplication.id)
          .select()
          .single()
      : await supabase
          .from("applications")
          .insert({
            gig_id,
            applicant_id: user.id,
            ...applicationData,
            ...(held ? { metadata: held } : {}),
          })
          .select()
          .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Track reputation
    const userDid = await getUserDid(supabase, user.id);
    if (userDid) {
      onApplicationSubmitted(userDid, gig_id);
    }

    // Note: notification is created by DB trigger (notify_on_new_application)
    // Do NOT insert a duplicate notification here.

    // A held application (spam-flagged applicant) is stored for review and the
    // poster hears nothing about it: no email, no webhook, no notification.
    if (held) {
      return NextResponse.json({ application }, { status: 201 });
    }

    // Email the poster: instantly for the first application on this gig in
    // the last 24h, otherwise via the daily digest. Gated on the poster's
    // email_new_application setting. Fire-and-forget.
    const { data: applicantProfile } = await supabase
      .from("profiles")
      .select("full_name, username")
      .eq("id", user.id)
      .single();

    notifyPosterOfNewApplicationInBackground({
      gigId: gig_id,
      gigTitle: gig.title,
      posterId: gig.poster_id,
      posterName: poster?.full_name || poster?.username || "there",
      applicationId: application.id,
      applicationMetadata: (application as { metadata?: unknown }).metadata,
      applicantName: applicantProfile?.full_name || applicantProfile?.username || "A candidate",
      coverLetter: applicationData.cover_letter,
    });

    // Log activity
    void logActivity(supabase, {
      userId: user.id,
      activityType: "gig_applied",
      referenceId: gig_id,
      referenceType: "gig",
      metadata: { gig_title: gig.title },
    });

    // Dispatch webhook to gig poster
    dispatchWebhookAsync(gig.poster_id, "application.new", {
      application_id: application.id,
      gig_id,
      gig_title: gig.title,
      applicant_id: user.id,
    });

    return NextResponse.json({ application }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
