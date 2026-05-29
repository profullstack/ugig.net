import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/leaderboard/zaps?period=week|month|all&sort=received|sent&limit=25
 * Public endpoint - no auth required.
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const period = url.searchParams.get("period") || "all";
    const sort = url.searchParams.get("sort") || "received";
    const parsedLimit = parseInt(url.searchParams.get("limit") || "25", 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 50)
      : 25;

    const admin = createServiceClient();

    let dateFilter: string | null = null;
    const now = new Date();
    if (period === "week") {
      dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (period === "month") {
      dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    }

    const column = sort === "sent" ? "sender_id" : "recipient_id";

    let query = (admin as any).from("zaps").select(`${column}, amount_sats`);
    if (dateFilter) {
      query = query.gte("created_at", dateFilter);
    }
    const { data: zaps, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Aggregate per user
    const userStats = new Map<string, { total_sats: number; zap_count: number }>();
    for (const zap of zaps || []) {
      const userId = zap[column];
      if (!userId) continue;
      const s = userStats.get(userId) || { total_sats: 0, zap_count: 0 };
      s.total_sats += zap.amount_sats || 0;
      s.zap_count++;
      userStats.set(userId, s);
    }

    // Sort and take top N
    const sorted = [...userStats.entries()]
      .sort((a, b) => b[1].total_sats - a[1].total_sats)
      .slice(0, limit);

    if (sorted.length === 0) {
      return NextResponse.json({ leaderboard: [], total_users: 0 });
    }

    // Fetch profiles
    const userIds = sorted.map(([id]) => id);
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, username, full_name, avatar_url")
      .in("id", userIds as string[]) as any;

    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

    const leaderboard = sorted.map(([userId, stats], index) => {
      const profile = profileMap.get(userId) as any;
      return {
        rank: index + 1,
        user: profile ? {
          id: profile.id,
          username: profile.username,
          name: profile.full_name,
          avatar_url: profile.avatar_url,
        } : { id: userId, username: null, name: "Unknown", avatar_url: null },
        total_sats: stats.total_sats,
        zap_count: stats.zap_count,
      };
    });

    return NextResponse.json({ leaderboard, total_users: userStats.size });
  } catch (err) {
    console.error("Zap leaderboard error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
