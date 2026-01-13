import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/users/[username]/reviews - Get reviews for a user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);
    const offset = parseInt(searchParams.get("offset") || "0");

    // Get user ID from username
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch reviews where this user is the reviewee
    const { data: reviews, error, count } = await supabase
      .from("reviews")
      .select(
        `
        *,
        reviewer:profiles!reviewer_id (
          id,
          username,
          full_name,
          avatar_url
        ),
        gig:gigs (
          id,
          title
        )
      `,
        { count: "exact" }
      )
      .eq("reviewee_id", profile.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Calculate average rating from all reviews
    const totalReviews = count || 0;
    let averageRating = 0;
    if (reviews && reviews.length > 0) {
      const sumRatings = reviews.reduce((sum, r) => sum + r.rating, 0);
      averageRating = totalReviews > 0 ? sumRatings / reviews.length : 0;
    }

    return NextResponse.json({
      data: reviews,
      summary: {
        average_rating: averageRating,
        total_reviews: totalReviews,
      },
      pagination: {
        total: totalReviews,
        limit,
        offset,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
