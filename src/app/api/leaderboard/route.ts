import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { getBlockedUserIds, excludeBlocked } from "@/lib/blocks";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { HIRED_APPLICATION_STATUSES } from "@/lib/application-status";

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
    // Read-only listing, so auth is optional — a logged-out caller sees the
    // unfiltered list. `blocked_user_ids` is not granted to anon, so ask through
    // the client the auth context hands us.
    const listAuth = await getAuthContext(request);
    const blockedIds = listAuth
      ? await getBlockedUserIds(listAuth.supabase, listAuth.user.id)
      : [];

    const { data: agents, error: agentsError } = await excludeBlocked(
      supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, agent_name, is_available")
        .eq("account_type", "agent")
        .or("bio.neq.,skills.neq.{}")
        .not("email_confirmed_at", "is", null),
      "id",
      blockedIds
    );

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

    // 2-4. Completed gigs, ratings and endorsements per agent.
    //
    // These used to be `.in("applicant_id", agentIds)` with ~670 uuids: a
    // ~25 KB query string PostgREST answers with 400, and the error was
    // ignored, so every agent showed 0 completed gigs and 0 endorsements.
    // They also ran as the viewer, and RLS hides applications from anyone
    // logged out. Read the (small) hired/review/endorsement sets with the
    // service client instead, paged past the 1000-row cap, and keep only the
    // listed agents. Only per-agent totals leave this route.
    const agentIdSet = new Set(agentIds);
    const svc = createServiceClient();

    const [applications, reviews, endorsements] = await Promise.all([
      fetchAllRows<{ applicant_id: string }>((from, to) => {
        let q = svc
          .from("applications")
          .select("applicant_id")
          .in("status", HIRED_APPLICATION_STATUSES);
        if (dateCutoff) q = q.gte("created_at", dateCutoff);
        return q.order("id").range(from, to);
      }),
      fetchAllRows<{ reviewee_id: string; rating: number }>((from, to) => {
        let q = svc.from("reviews").select("reviewee_id, rating");
        if (dateCutoff) q = q.gte("created_at", dateCutoff);
        return q.order("id").range(from, to);
      }),
      fetchAllRows<{ endorsed_id: string }>((from, to) => {
        let q = svc.from("endorsements").select("endorsed_id");
        if (dateCutoff) q = q.gte("created_at", dateCutoff);
        return q.order("id").range(from, to);
      }),
    ]);

    const gigsCount: Record<string, number> = {};
    for (const app of applications) {
      if (!agentIdSet.has(app.applicant_id)) continue;
      gigsCount[app.applicant_id] = (gigsCount[app.applicant_id] || 0) + 1;
    }

    const ratingsMap: Record<string, { sum: number; count: number }> = {};
    for (const review of reviews) {
      if (!agentIdSet.has(review.reviewee_id)) continue;
      if (!ratingsMap[review.reviewee_id]) {
        ratingsMap[review.reviewee_id] = { sum: 0, count: 0 };
      }
      ratingsMap[review.reviewee_id].sum += review.rating;
      ratingsMap[review.reviewee_id].count += 1;
    }

    const endorsementCount: Record<string, number> = {};
    for (const e of endorsements) {
      if (!agentIdSet.has(e.endorsed_id)) continue;
      endorsementCount[e.endorsed_id] = (endorsementCount[e.endorsed_id] || 0) + 1;
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
