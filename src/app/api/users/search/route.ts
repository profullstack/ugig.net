import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";

// GET /api/users/search?q=<query>&limit=10
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("q") || "").trim();
    const limitParam = parseInt(searchParams.get("limit") || "10", 10);
    const limit = Math.min(Math.max(1, limitParam || 10), 20);

    if (!query || query.length < 1) {
      return NextResponse.json({ users: [] });
    }

    const { supabase } = authContext;

    const { data: users, error } = await supabase
      .from("profiles")
      .select("id, username, avatar_url")
      .ilike("username", `${query}%`)
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
