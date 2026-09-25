import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { getBlockedUserIds, excludeBlocked } from "@/lib/blocks";

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

// GET /api/users/[username]/followers - list a user's followers
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const supabase = await createClient();

    // A blocked user must not show up in someone else's follower list either.
    // Read-only, so auth is optional. `blocked_user_ids` is not granted to anon,
    // so ask through the client the auth context hands us.
    const viewerAuth = await getAuthContext(request);
    const blockedIds = viewerAuth
      ? await getBlockedUserIds(viewerAuth.supabase, viewerAuth.user.id)
      : [];
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

    // Get followers with profile details
    const { data: follows, error, count } = await excludeBlocked(
      supabase
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
        .eq("following_id", targetProfile.id),
      "follower_id",
      blockedIds
    )
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
