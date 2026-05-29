import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parsePaginationParam } from "@/lib/api-pagination";

// GET /api/users/:username/activity - Public activity feed for a user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const searchParams = request.nextUrl.searchParams;
    const limit = parsePaginationParam(searchParams.get("limit"), 20, 1, 50);
    const offset = parsePaginationParam(searchParams.get("offset"), 0, 0, 100_000);

    const supabase = await createClient();

    // First look up the user by username
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Fetch public activities for this user
    const { data: activities, error, count } = await supabase
      .from("activities")
      .select(
        `
        *,
        user:profiles!user_id (
          id,
          username,
          full_name,
          avatar_url
        )
      `,
        { count: "exact" }
      )
      .eq("user_id", profile.id)
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      data: activities,
      pagination: {
        total: count || 0,
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
