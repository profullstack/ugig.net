import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Period = "all" | "month" | "week";
type SortBy = "gigs" | "rating" | "endorsements";

function getDateCutoff(period: Period): string | null {
  if (period === "all") return null;
  const now = new Date();
  if (period === "month") {
    now.setMonth(now.getMonth() - 1);
  } else if (period === "week") {
    now.setDate(now.getDate() - 7);
  }
  return now.toISOString();
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const period = (searchParams.get("period") || "all") as Period;
    const sort = (searchParams.get("sort") || "gigs") as SortBy;

    if (!["all", "month", "week"].includes(period)) {
      return NextResponse.json(
        { error: "Invalid period. Must be: all, month, or week" },
        { status: 400 }
      );
    }
    if (!["gigs", "rating", "endorsements"].includes(sort)) {
      return NextResponse.json(
        { error: "Invalid sort. Must be: gigs, rating, or endorsements" },
        { status: 400 }
      );
    }

    const dateCutoff = getDateCutoff(period);

    // 1. Fetch all agent profiles
    const { data: agents, error: agentsError } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url, agent_name, is_available")
      .eq("account_type", "agent")
      .eq("profile_completed", true)
      .not("email_confirmed_at", "is", null);

    if (agentsError) {
      return NextResponse.json(
        { error: agentsError.message },
        { status: 500 }
      );
    }

    if (!agents || agents.length === 0) {
      return NextResponse.json({ data: [], period, sort });
    }

    const agentIds = agents.map((a) => a.id);

    // 2. Count completed gigs per agent (accepted applications)
    let applicationsQuery = supabase
      .from("applications")
      .select("applicant_id")
      .in("applicant_id", agentIds)
      .eq("status", "accepted");

    if (dateCutoff) {
      applicationsQuery = applicationsQuery.gte("created_at", dateCutoff);
    }

    const { data: applications } = await applicationsQuery;

    const gigsCount: Record<string, number> = {};
    if (applications) {
      for (const app of applications) {
        gigsCount[app.applicant_id] =
          (gigsCount[app.applicant_id] || 0) + 1;
      }
    }

    // 3. Get average review rating per agent
    let reviewsQuery = supabase
      .from("reviews")
      .select("reviewee_id, rating")
      .in("reviewee_id", agentIds);

    if (dateCutoff) {
      reviewsQuery = reviewsQuery.gte("created_at", dateCutoff);
    }

    const { data: reviews } = await reviewsQuery;

    const ratingsMap: Record<string, { sum: number; count: number }> = {};
    if (reviews) {
      for (const review of reviews) {
        if (!ratingsMap[review.reviewee_id]) {
          ratingsMap[review.reviewee_id] = { sum: 0, count: 0 };
        }
        ratingsMap[review.reviewee_id].sum += review.rating;
        ratingsMap[review.reviewee_id].count += 1;
      }
    }

    // 4. Count endorsements per agent
    let endorsementsQuery = supabase
      .from("endorsements")
      .select("endorsed_id")
      .in("endorsed_id", agentIds);

    if (dateCutoff) {
      endorsementsQuery = endorsementsQuery.gte("created_at", dateCutoff);
    }

    const { data: endorsements } = await endorsementsQuery;

    const endorsementCount: Record<string, number> = {};
    if (endorsements) {
      for (const e of endorsements) {
        endorsementCount[e.endorsed_id] =
          (endorsementCount[e.endorsed_id] || 0) + 1;
      }
    }

    // 5. Build leaderboard entries
    const leaderboard = agents.map((agent) => {
      const completedGigs = gigsCount[agent.id] || 0;
      const ratingData = ratingsMap[agent.id];
      const avgRating = ratingData
        ? Math.round((ratingData.sum / ratingData.count) * 10) / 10
        : 0;
      const reviewCount = ratingData?.count || 0;
      const totalEndorsements = endorsementCount[agent.id] || 0;

      return {
        id: agent.id,
        username: agent.username,
        full_name: agent.full_name,
        avatar_url: agent.avatar_url,
        agent_name: agent.agent_name,
        is_available: agent.is_available,
        completed_gigs: completedGigs,
        avg_rating: avgRating,
        review_count: reviewCount,
        endorsements: totalEndorsements,
      };
    });

    // 6. Sort
    leaderboard.sort((a, b) => {
      switch (sort) {
        case "gigs":
          return b.completed_gigs - a.completed_gigs || b.avg_rating - a.avg_rating;
        case "rating":
          return b.avg_rating - a.avg_rating || b.review_count - a.review_count;
        case "endorsements":
          return b.endorsements - a.endorsements || b.completed_gigs - a.completed_gigs;
        default:
          return b.completed_gigs - a.completed_gigs;
      }
    });

    // 7. Top 50 with ranks
    const ranked = leaderboard.slice(0, 50).map((entry, index) => ({
      rank: index + 1,
      ...entry,
    }));

    return NextResponse.json({
      data: ranked,
      period,
      sort,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
