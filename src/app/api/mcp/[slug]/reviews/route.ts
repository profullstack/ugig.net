import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { mcpReviewSchema } from "@/lib/mcp/validation";

/**
 * GET /api/mcp/[slug]/reviews - List reviews for an MCP server
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = await createClient();

    // Get listing ID from slug
    const { data: listing } = await supabase
      .from("mcp_listings" as any)
      .select("id")
      .eq("slug", slug)
      .single();

    if (!listing) {
      return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
    }

    const { data: reviews, error } = await supabase
      .from("mcp_reviews" as any)
      .select(
        `*, reviewer:profiles!reviewer_id (id, username, full_name, avatar_url)`
      )
      .eq("listing_id", (listing as any).id)
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
 * POST /api/mcp/[slug]/reviews - Leave a review (must have purchased)
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
    const parsed = mcpReviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const admin = createServiceClient();

    // Get listing
    const { data: listing } = await admin
      .from("mcp_listings" as any)
      .select("id, seller_id")
      .eq("slug", slug)
      .single();

    if (!listing) {
      return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
    }

    // Must have purchased
    const { data: purchase } = await admin
      .from("mcp_purchases" as any)
      .select("id")
      .eq("listing_id", (listing as any).id)
      .eq("buyer_id", auth.user.id)
      .single();

    if (!purchase) {
      return NextResponse.json(
        { error: "You must purchase this MCP server before reviewing" },
        { status: 403 }
      );
    }

    const { data: review, error } = await admin
      .from("mcp_reviews" as any)
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
          { error: "You have already reviewed this MCP server" },
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
      type: "mcp_review",
      title: "New review on your MCP server ⭐",
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
