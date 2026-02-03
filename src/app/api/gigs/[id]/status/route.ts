import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, createServiceClient } from "@/lib/auth/get-user";
import { z } from "zod";
import { dispatchWebhookAsync } from "@/lib/webhooks/dispatch";
import { sendEmail, gigFilledEmail } from "@/lib/email";

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
      .select("poster_id, status, created_at, title, poster:profiles!poster_id(full_name, username)")
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

    // If transitioning from non-active to active, check usage limit
    if (newStatus === "active" && oldStatus !== "active") {
      const { data: subscription } = await supabase
        .from("subscriptions")
        .select("plan")
        .eq("user_id", user.id)
        .single();

      if (!subscription || subscription.plan === "free") {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        const { data: usage } = await supabase
          .from("gig_usage")
          .select("posts_count")
          .eq("user_id", user.id)
          .eq("month", month)
          .eq("year", year)
          .single();

        if (usage && usage.posts_count >= 10) {
          return NextResponse.json(
            {
              error:
                "You've reached your monthly limit of 10 gig posts. Upgrade to Pro for unlimited posts.",
            },
            { status: 403 }
          );
        }
      }

      // Increment usage when activating
      const createdAt = new Date(existingGig.created_at);
      const month = createdAt.getMonth() + 1;
      const year = createdAt.getFullYear();

      await supabase.rpc("increment_gig_usage", {
        p_user_id: user.id,
        p_month: month,
        p_year: year,
      });
    }

    // Update the status
    const { data: gig, error } = await supabase
      .from("gigs")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Dispatch webhook for gig status change
    dispatchWebhookAsync(user.id, "gig.update", {
      gig_id: id,
      old_status: oldStatus,
      new_status: newStatus,
    });

    // Send email when gig is filled
    if (newStatus === "filled" && oldStatus !== "filled") {
      // Get count of accepted applications
      const { count: hiredCount } = await supabase
        .from("applications")
        .select("*", { count: "exact", head: true })
        .eq("gig_id", id)
        .eq("status", "accepted");

      // Get poster email
      const adminClient = createServiceClient();
      const { data: posterAuth } = await adminClient.auth.admin.getUserById(user.id);
      const posterEmail = posterAuth?.user?.email;

      const poster = existingGig.poster as { full_name: string | null; username: string | null } | null;

      if (posterEmail) {
        void sendEmail({
          to: posterEmail,
          ...gigFilledEmail({
            posterName: poster?.full_name || poster?.username || "there",
            gigTitle: existingGig.title || "Your gig",
            gigId: id,
            hiredCount: hiredCount || 0,
          }),
        });
      }
    }

    return NextResponse.json({ gig });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
