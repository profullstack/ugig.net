import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail } from "@/lib/email";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const gigId = searchParams.get("gig_id");

    if (!gigId) {
      return NextResponse.json(
        { error: "gig_id query parameter is required" },
        { status: 400 }
      );
    }

    const serviceClient = createServiceClient();

    const { data, error } = await serviceClient
      .from("testimonials")
      .select("id, rating, content, status, created_at, author_id")
      .eq("gig_id", gigId)
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Fetch author profiles
    const authorIds = [...new Set((data || []).map((t) => t.author_id))];
    let authorMap: Record<string, { username: string; full_name: string | null; avatar_url: string | null }> = {};

    if (authorIds.length > 0) {
      const { data: authors } = await serviceClient
        .from("profiles")
        .select("id, username, full_name, avatar_url")
        .in("id", authorIds);

      if (authors) {
        authorMap = Object.fromEntries(
          authors.map((a) => [a.id, { username: a.username, full_name: a.full_name, avatar_url: a.avatar_url }])
        );
      }
    }

    const testimonials = (data || []).map((t) => ({
      id: t.id,
      rating: t.rating,
      content: t.content,
      created_at: t.created_at,
      author: authorMap[t.author_id] || { username: "unknown", full_name: null, avatar_url: null },
    }));

    return NextResponse.json({ testimonials });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const body = await request.json();
    const { profile_id, gig_id, rating, content } = body;

    // Must provide exactly one target
    if (!profile_id && !gig_id) {
      return NextResponse.json(
        { error: "Either profile_id or gig_id is required" },
        { status: 400 }
      );
    }

    // Both profile_id and gig_id allowed (e.g. reviewing a worker for a gig)

    if (!rating || !content) {
      return NextResponse.json(
        { error: "rating and content are required" },
        { status: 400 }
      );
    }

    if (typeof rating !== "number" || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "Rating must be between 1 and 5" },
        { status: 400 }
      );
    }

    if (typeof content !== "string" || content.trim().length === 0 || content.length > 1000) {
      return NextResponse.json(
        { error: "Content must be between 1 and 1000 characters" },
        { status: 400 }
      );
    }

    const serviceClient = createServiceClient();

    // Determine the notification recipient and validate ownership
    let notifyUserId: string;
    let targetLabel: string;
    let notificationLink: string;

    if (gig_id) {
      // Gig testimonial - look up the gig poster
      const { data: gig, error: gigError } = await serviceClient
        .from("gigs")
        .select("poster_id, title")
        .eq("id", gig_id)
        .single();

      if (gigError || !gig) {
        return NextResponse.json(
          { error: "Gig not found" },
          { status: 404 }
        );
      }

      if (gig.poster_id === user.id) {
        // Gig poster is leaving a testimonial (e.g. reviewing the worker)
        if (profile_id && profile_id !== user.id) {
          notifyUserId = profile_id;
          targetLabel = `the gig "${gig.title}"`;
        } else if (profile_id === user.id) {
          return NextResponse.json(
            { error: "You cannot leave a testimonial for yourself" },
            { status: 400 }
          );
        } else {
          return NextResponse.json(
            { error: "profile_id is required when the gig poster leaves a testimonial" },
            { status: 400 }
          );
        }
      } else {
        // Someone else leaving a testimonial on this gig — notify the poster
        notifyUserId = gig.poster_id;
        targetLabel = `your gig "${gig.title}"`;
      }
      notificationLink = "/dashboard/testimonials";
    } else {
      // Profile testimonial
      if (profile_id === user.id) {
        return NextResponse.json(
          { error: "You cannot leave a testimonial for yourself" },
          { status: 400 }
        );
      }

      notifyUserId = profile_id;
      targetLabel = "your profile";
      notificationLink = "/dashboard/testimonials";
    }

    // Any testimonial tied to a gig auto-approves (including gig+profile worker reviews)
    // to avoid manual gatekeeping of gig feedback.
    // Profile-only testimonials remain pending for profile owner approval.
    const autoApprove = !!gig_id;

    const { data, error } = await serviceClient
      .from("testimonials")
      .insert({
        profile_id: profile_id || null,
        gig_id: gig_id || null,
        author_id: user.id,
        rating,
        content: content.trim(),
        ...(autoApprove ? { status: "approved" } : {}),
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        const target = gig_id ? "gig" : "profile";
        return NextResponse.json(
          { error: `You have already left a testimonial for this ${target}` },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Send notification + email
    try {
      const { data: authorProfile } = await serviceClient
        .from("profiles")
        .select("full_name, username")
        .eq("id", user.id)
        .single();

      const authorName = authorProfile?.full_name || authorProfile?.username || "Someone";
      const stars = "★".repeat(rating) + "☆".repeat(5 - rating);

      // In-app notification
      await serviceClient.from("notifications").insert({
        user_id: notifyUserId,
        type: "review_received",
        title: `${authorName} left a ${rating}-star testimonial on ${targetLabel}`,
        message: content.trim().slice(0, 200),
        link: notificationLink,
      });

      // Email notification
      const { data: profileOwnerAuth } = await serviceClient.auth.admin.getUserById(notifyUserId);
      const ownerEmail = profileOwnerAuth?.user?.email;

      if (ownerEmail) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";
        await sendEmail({
          to: ownerEmail,
          subject: `${authorName} left a ${rating}-star testimonial on ${targetLabel} — ugig.net`,
          html: `
            <div style="font-family: sans-serif; max-width: 500px;">
              <h2>New Testimonial ${stars}</h2>
              <p><strong>${authorName}</strong> left a ${rating}-star testimonial on ${targetLabel}:</p>
              <blockquote style="border-left: 3px solid #6366f1; padding-left: 12px; color: #555; margin: 16px 0;">
                "${content.trim()}"
              </blockquote>
              <p>
                <a href="${baseUrl}${notificationLink}" style="display: inline-block; padding: 10px 20px; background: #6366f1; color: white; text-decoration: none; border-radius: 6px;">
                  ${autoApprove ? "View Testimonial" : "Review & Approve"}
                </a>
              </p>
              ${!autoApprove ? `<p style="color: #888; font-size: 13px;">
                Testimonials appear after you approve them.
              </p>` : ""}
            </div>
          `,
          text: `${authorName} left a ${rating}-star testimonial on ${targetLabel}: "${content.trim()}"\n\nReview it at ${baseUrl}${notificationLink}`,
        });
      }
    } catch (notifyErr) {
      console.error("Failed to send testimonial notification:", notifyErr);
    }

    return NextResponse.json({ testimonial: data }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
