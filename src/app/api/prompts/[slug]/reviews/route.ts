import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBlockedUserIds, excludeBlocked } from "@/lib/blocks";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { promptReviewSchema } from "@/lib/prompts/validation";

/**
 * GET /api/prompts/[slug]/reviews - List reviews for a prompt
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = await createClient();

    // Hide comments by anyone on either side of a block. Read-only, so auth is
    // optional — a logged-out caller sees the whole thread. `blocked_user_ids`
    // is not granted to anon, so ask through the auth context's client.
    const viewerAuth = await getAuthContext(request);
    const blockedIds = viewerAuth
      ? await getBlockedUserIds(viewerAuth.supabase, viewerAuth.user.id)
      : [];

    // Get listing ID from slug
    const { data: listing } = await supabase
      .from("prompt_listings" as any)
      .select("id")
      .eq("slug", slug)
      .single();

    if (!listing) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    const { data: reviews, error } = await excludeBlocked(
      supabase
        .from("prompt_reviews" as any)
        .select(
          `*, reviewer:profiles!reviewer_id (id, username, full_name, avatar_url)`
        )
        .eq("listing_id", (listing as any).id),
      "reviewer_id",
      blockedIds
    )
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ reviews: reviews || [] });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

/**
 * POST /api/prompts/[slug]/reviews - Leave a review (must have purchased)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = promptReviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const admin = createServiceClient();

    // Get listing
    const { data: listing } = await admin
      .from("prompt_listings" as any)
      .select("id, seller_id")
      .eq("slug", slug)
      .single();

    if (!listing) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    // Must have purchased
    const { data: purchase } = await admin
      .from("prompt_purchases" as any)
      .select("id")
      .eq("listing_id", (listing as any).id)
      .eq("buyer_id", auth.user.id)
      .single();

    if (!purchase) {
      return NextResponse.json(
        { error: "You must purchase this prompt before reviewing" },
        { status: 403 }
      );
    }

    const { data: review, error } = await admin
      .from("prompt_reviews" as any)
      .insert({
        listing_id: (listing as any).id,
        purchase_id: (purchase as any).id,
        reviewer_id: auth.user.id,
        rating: parsed.data.rating,
        comment: parsed.data.comment || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "You have already reviewed this prompt" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Notify seller
    const { data: reviewerProfile } = await admin
      .from("profiles")
      .select("username")
      .eq("id", auth.user.id)
      .single();

    await (admin.from("notifications") as any).insert({
      user_id: (listing as any).seller_id,
      type: "prompt_review",
      title: "New review on your prompt ⭐",
      body: `${reviewerProfile?.username || "Someone"} left a ${parsed.data.rating}-star review`,
      data: {
        listing_id: (listing as any).id,
        review_id: (review as any).id,
        rating: parsed.data.rating,
      },
    });

    return NextResponse.json({ review }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
