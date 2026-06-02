import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function parseNonNegativeInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

// GET /api/users/[username]/following - list who a user follows
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;
    const limit = parsePositiveInt(searchParams.get("limit"), 20, 100);
    const offset = Math.min(parseNonNegativeInt(searchParams.get("offset"), 0), 100_000);

    // Look up target user
    const { data: targetProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .single();

    if (profileError || !targetProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get following with profile details
    const { data: follows, error, count } = await supabase
      .from("follows")
      .select(
        `
        id,
        created_at,
        following:profiles!following_id (
          id,
          username,
          full_name,
          avatar_url,
          bio,
          is_available,
          account_type,
          verified,
          verification_type
        )
      `,
        { count: "exact" }
      )
      .eq("follower_id", targetProfile.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Flatten: extract the profile from each follow record
    const following = (follows || []).map((f) => ({
      ...f.following,
      followed_at: f.created_at,
    }));

    return NextResponse.json({
      data: following,
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
