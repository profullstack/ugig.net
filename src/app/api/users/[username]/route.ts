import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/users/[username] - Get public profile
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const supabase = await createClient();

    const { data: profile, error } = await supabase
      .from("profiles")
      .select(
        `
        id,
        username,
        full_name,
        avatar_url,
        bio,
        skills,
        ai_tools,
        hourly_rate,
        portfolio_urls,
        location,
        is_available,
        followers_count,
        following_count,
        created_at
      `
      )
      .eq("username", username)
      .single();

    if (error || !profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get user's average rating
    const { data: reviews } = await supabase
      .from("reviews")
      .select("rating")
      .eq("reviewee_id", profile.id);

    const averageRating =
      reviews && reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : null;

    // Get completed gigs count
    const { count: completedGigs } = await supabase
      .from("gigs")
      .select("*", { count: "exact", head: true })
      .eq("poster_id", profile.id)
      .eq("status", "filled");

    return NextResponse.json({
      profile: {
        ...profile,
        average_rating: averageRating,
        reviews_count: reviews?.length || 0,
        completed_gigs: completedGigs || 0,
        followers_count: profile.followers_count ?? 0,
        following_count: profile.following_count ?? 0,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
