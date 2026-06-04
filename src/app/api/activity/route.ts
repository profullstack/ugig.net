import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";

const MAX_ACTIVITY_OFFSET = 100_000;
const MAX_ACTIVITY_LIMIT = 50;

// GET /api/activity - User's own activity feed (includes private activities)
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const searchParams = request.nextUrl.searchParams;

    const limitRaw = searchParams.get("limit");
    let limit = 20;
    if (limitRaw !== null) {
      const v = Number(limitRaw);
      if (!Number.isFinite(v) || !Number.isInteger(v) || v < 1) {
        return NextResponse.json(
          { error: "Invalid limit. Must be a positive integer (>= 1)." },
          { status: 400 }
        );
      }
      limit = Math.min(v, MAX_ACTIVITY_LIMIT);
    }

    const offsetRaw = searchParams.get("offset");
    let offset = 0;
    if (offsetRaw !== null) {
      const v = Number(offsetRaw);
      if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0) {
        return NextResponse.json(
          { error: "Invalid offset. Must be a non-negative integer (>= 0)." },
          { status: 400 }
        );
      }
      offset = Math.min(v, MAX_ACTIVITY_OFFSET);
    }

    const { data: activities, error, count } = await supabase
      .from("activities")
      .select(
        `*,
        user:profiles!user_id (
          id,
          username,
          full_name,
          avatar_url
        )
      `,
        { count: "exact" }
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[GET /api/activity] Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      data: activities,
      pagination: { total: count || 0, limit, offset },
    });
  } catch (err) {
    console.error("[GET /api/activity] Unexpected error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
