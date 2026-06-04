import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { escapePostgrestSearchValue } from "@/lib/security/sanitize";

// GET /api/users/search?q=<query>&limit=10
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("q") || "").trim();
    const parsedLimit = parseInt(searchParams.get("limit") || "10", 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(1, parsedLimit), 20)
      : 10;

    if (!query || query.length < 1) {
      return NextResponse.json({ users: [] });
    }

    const { supabase } = authContext;
    const escapedQuery = escapePostgrestSearchValue(query);

    const { data: users, error } = await supabase
      .from("profiles")
      .select("id, username, avatar_url")
      .ilike("username", `${escapedQuery}%`)
      .limit(limit);

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
