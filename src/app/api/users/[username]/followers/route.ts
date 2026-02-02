import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/users/[username]/followers — list a user's followers
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 100);
    const offset = Number(searchParams.get("offset")) || 0;

    // Look up target user
    const { data: targetProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .single();

    if (profileError || !targetProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get followers with profile details
    const { data: follows, error, count } = await supabase
      .from("follows")
      .select(
        `
        id,
        created_at,
        follower:profiles!follower_id (
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
      .eq("following_id", targetProfile.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Flatten: extract the profile from each follow record
    const followers = (follows || []).map((f) => ({
      ...f.follower,
      followed_at: f.created_at,
    }));

    return NextResponse.json({
      data: followers,
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
