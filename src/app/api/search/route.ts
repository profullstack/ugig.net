import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type SearchType = "gigs" | "agents" | "posts" | "all";

// GET /api/search?q=<query>&type=gigs|agents|posts|all&page=1&limit=10
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q")?.trim() || "";
    const type = (searchParams.get("type") || "all") as SearchType;
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 10));

    if (!query) {
      return NextResponse.json(
        { error: "Search query is required" },
        { status: 400 }
      );
    }

    if (!["gigs", "agents", "posts", "all"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid type. Must be gigs, agents, posts, or all" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const offset = (page - 1) * limit;

    // Escape special ilike characters
    const escaped = query.replace(/%/g, "\\%").replace(/_/g, "\\_");
    const pattern = `%${escaped}%`;

    const results: Record<string, unknown> = {};

    // Search gigs
    if (type === "gigs" || type === "all") {
      const gigLimit = type === "all" ? 5 : limit;
      const gigOffset = type === "all" ? 0 : offset;

      let gigQuery = supabase
        .from("gigs")
        .select(
          `
          *,
          poster:profiles!poster_id (
            id,
            username,
            full_name,
            avatar_url,
            account_type
          )
        `,
          { count: "exact" }
        )
        .eq("status", "active")
        .or(
          `title.ilike.${pattern},description.ilike.${pattern},skills_required.cs.{"${escaped}"}`
        )
        .order("created_at", { ascending: false })
        .range(gigOffset, gigOffset + gigLimit - 1);

      const { data: gigs, count: gigsCount, error: gigsError } = await gigQuery;

      if (gigsError) {
        // Fallback: try without array containment (skills_required)
        const fallback = await supabase
          .from("gigs")
          .select(
            `
            *,
            poster:profiles!poster_id (
              id,
              username,
              full_name,
              avatar_url,
              account_type
            )
          `,
            { count: "exact" }
          )
          .eq("status", "active")
          .or(`title.ilike.${pattern},description.ilike.${pattern}`)
          .order("created_at", { ascending: false })
          .range(gigOffset, gigOffset + gigLimit - 1);

        results.gigs = {
          data: fallback.data || [],
          total: fallback.count || 0,
          page: type === "all" ? 1 : page,
          limit: gigLimit,
          hasMore: (fallback.count || 0) > gigOffset + gigLimit,
        };
      } else {
        results.gigs = {
          data: gigs || [],
          total: gigsCount || 0,
          page: type === "all" ? 1 : page,
          limit: gigLimit,
          hasMore: (gigsCount || 0) > gigOffset + gigLimit,
        };
      }
    }

    // Search agents (profiles)
    if (type === "agents" || type === "all") {
      const agentLimit = type === "all" ? 5 : limit;
      const agentOffset = type === "all" ? 0 : offset;

      const { data: agents, count: agentsCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact" })
        .eq("profile_completed", true)
        .not("email_confirmed_at", "is", null)
        .or(
          `username.ilike.${pattern},full_name.ilike.${pattern},bio.ilike.${pattern}`
        )
        .order("last_active_at", { ascending: false })
        .range(agentOffset, agentOffset + agentLimit - 1);

      results.agents = {
        data: agents || [],
        total: agentsCount || 0,
        page: type === "all" ? 1 : page,
        limit: agentLimit,
        hasMore: (agentsCount || 0) > agentOffset + agentLimit,
      };
    }

    // Search posts
    if (type === "posts" || type === "all") {
      const postLimit = type === "all" ? 5 : limit;
      const postOffset = type === "all" ? 0 : offset;

      let postQuery = supabase
        .from("posts")
        .select(
          `
          *,
          author:profiles!author_id (
            id,
            username,
            full_name,
            avatar_url,
            account_type
          )
        `,
          { count: "exact" }
        )
        .or(`content.ilike.${pattern}`)
        .order("created_at", { ascending: false })
        .range(postOffset, postOffset + postLimit - 1);

      const { data: posts, count: postsCount } = await postQuery;

      results.posts = {
        data: posts || [],
        total: postsCount || 0,
        page: type === "all" ? 1 : page,
        limit: postLimit,
        hasMore: (postsCount || 0) > postOffset + postLimit,
      };
    }

    return NextResponse.json({
      query,
      type,
      results,
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
