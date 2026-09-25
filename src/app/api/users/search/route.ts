import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { parsePaginationParam } from "@/lib/api-pagination";
import { escapePostgrestSearchValue } from "@/lib/security/sanitize";
import { getBlockedUserIds, excludeBlocked } from "@/lib/blocks";

// GET /api/users/search?q=<query>&limit=10
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("q") || "").trim();
    const limit = parsePaginationParam(searchParams.get("limit"), 10, 1, 20);

    if (!query || query.length < 1) {
      return NextResponse.json({ users: [] });
    }

    const { supabase } = authContext;
    const escapedQuery = escapePostgrestSearchValue(query);

    // Never offer a blocked user for a mention.
    const blockedIds = await getBlockedUserIds(supabase, authContext.user.id);

    const { data: users, error } = await excludeBlocked(
      supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .ilike("username", `${escapedQuery}%`),
      "id",
      blockedIds
    ).limit(limit);

    if (error) {
      return NextResponse.json(
        { error: "Failed to search users" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      users: (users || []).map((u) => ({
        id: u.id,
        username: u.username,
        avatar_url: u.avatar_url,
      })),
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
