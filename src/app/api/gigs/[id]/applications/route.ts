import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, createServiceClient } from "@/lib/auth/get-user";
import { applicationSchema } from "@/lib/validations";
import { sendEmail, newApplicationEmail } from "@/lib/email";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";
import { dispatchWebhookAsync } from "@/lib/webhooks/dispatch";
import { getUserDid, onApplicationSubmitted } from "@/lib/reputation-hooks";
import { logActivity } from "@/lib/activity";

// GET /api/gigs/[id]/applications - Get applications for a gig (poster only)
export async function GET(
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

    const { data: gig } = await supabase
      .from("gigs")
      .select("poster_id, title")
      .eq("id", id)
      .single();

    if (!gig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }

    if (gig.poster_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: applications, error } = await supabase
      .from("applications")
      .select(
        `
        *,
        applicant:profiles!applicant_id (
          id,
          username,
          full_name,
          avatar_url,
          bio,
          skills,
          ai_tools,
          hourly_rate,
          portfolio_urls,
          is_available
        )
      `
      )
      .eq("gig_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      gig: { id, title: gig.title },
      applications,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// POST /api/gigs/[id]/applications - Apply to a gig (fixes #12)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gigId } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const rl = checkRateLimit(getRateLimitIdentifier(request, user.id), "write");
    if (!rl.allowed) return rateLimitExceeded(rl);

    const body = await request.json();
    const validationResult = applicationSchema.safeParse({ ...body, gig_id: gigId });

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { gig_id, ...applicationData } = validationResult.data;

    const { data: gig } = await supabase
      .from("gigs")
      .select("poster_id, status, title, poster:profiles!poster_id(full_name, username)")
      .eq("id", gig_id)
      .single();

    if (!gig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }

    const poster = Array.isArray(gig.poster) ? gig.poster[0] : gig.poster;

    if (gig.status !== "active") {
      return NextResponse.json(
        { error: "This gig is no longer accepting applications" },
        { status: 400 }
      );
    }

    if (gig.poster_id === user.id) {
      return NextResponse.json(
        { error: "You cannot apply to your own gig" },
        { status: 400 }
      );
    }

    const { data: existingApplication } = await supabase
      .from("applications")
      .select("id")
      .eq("gig_id", gig_id)
      .eq("applicant_id", user.id)
      .single();

    if (existingApplication) {
      return NextResponse.json(
        { error: "You have already applied to this gig" },
        { status: 400 }
      );
    }

    const { data: application, error } = await supabase
      .from("applications")
      .insert({
        gig_id,
        applicant_id: user.id,
        ...applicationData,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const userDid = await getUserDid(supabase, user.id);
    if (userDid) {
      onApplicationSubmitted(userDid, gig_id);
    }

    await supabase.from("notifications").insert({
      user_id: gig.poster_id,
      type: "new_application",
      title: "New application received",
      body: "Someone applied to your gig",
      data: { gig_id, application_id: application.id },
    });

    const adminClient = createServiceClient();
    const { data: posterAuth } = await adminClient.auth.admin.getUserById(gig.poster_id);
    const posterEmail = posterAuth?.user?.email;

    if (posterEmail) {
      const { data: applicantProfile } = await supabase
        .from("profiles")
        .select("full_name, username")
        .eq("id", user.id)
        .single();

      const applicantName = applicantProfile?.full_name || applicantProfile?.username || "A candidate";
      const posterName = poster?.full_name || poster?.username || "there";

      const emailContent = newApplicationEmail({
        posterName,
        applicantName,
        gigTitle: gig.title,
        gigId: gig_id,
        applicationId: application.id,
        coverLetterPreview: applicationData.cover_letter,
      });

      await sendEmail({ to: posterEmail, ...emailContent });
    }

    void logActivity(supabase, {
      userId: user.id,
      activityType: "gig_applied",
      referenceId: gig_id,
      referenceType: "gig",
      metadata: { gig_title: gig.title },
    });

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
