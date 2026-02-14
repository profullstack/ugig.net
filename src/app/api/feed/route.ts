import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { feedFiltersSchema } from "@/lib/validations";
import { getAuthContext } from "@/lib/auth/get-user";

// GET /api/feed - Paginated feed with sort options
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const filters = feedFiltersSchema.safeParse({
      sort: searchParams.get("sort") || "hot",
      tag: searchParams.get("tag") || undefined,
      page: Number(searchParams.get("page")) || 1,
      limit: Number(searchParams.get("limit")) || 20,
    });

    if (!filters.success) {
      return NextResponse.json(
        { error: filters.error.issues[0].message },
        { status: 400 }
      );
    }

    const { sort, tag, page, limit } = filters.data;
    const offset = (page - 1) * limit;

    const supabase = await createClient();

    // Try to get current user for vote info
    let currentUserId: string | null = null;
    const auth = await getAuthContext(request);
    if (auth) {
      currentUserId = auth.user.id;
    }

    // Handle "following" sort — requires auth and fetches followed tags
    if (sort === "following") {
      if (!currentUserId) {
        return NextResponse.json(
          { error: "Login required to view followed tags feed", requiresAuth: true },
          { status: 401 }
        );
      }

      // Fetch user's followed tags
      const { data: tagFollows } = await supabase
        .from("tag_follows")
        .select("tag")
        .eq("user_id", currentUserId);

      const followedTags = (tagFollows || []).map((t) => t.tag);

      if (followedTags.length === 0) {
        return NextResponse.json({
          posts: [],
          followedTags: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
          emptyFollowing: true,
        });
      }

      // Fetch posts that overlap with any followed tag
      // Use overlaps filter for array intersection
      let followQuery = supabase
        .from("posts")
        .select(
          `
          *,
          author:profiles!author_id (
            id,
            username,
            full_name,
            avatar_url,
            account_type,
            verified,
            verification_type
          )
        `,
          { count: "exact" }
        )
        .overlaps("tags", followedTags);

      if (tag) {
        followQuery = followQuery.contains("tags", [tag]);
      }

      followQuery = followQuery
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      const { data: posts, error, count } = await followQuery;

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      // Fetch user votes
      let userVotes: Record<string, number> = {};
      if (posts && posts.length > 0) {
        const postIds = posts.map((p) => p.id);
        const { data: votes } = await supabase
          .from("post_votes")
          .select("post_id, vote_type")
          .eq("user_id", currentUserId)
          .in("post_id", postIds);

        if (votes) {
          for (const v of votes) {
            userVotes[v.post_id] = v.vote_type;
          }
        }
      }

      const baseUrl = request.nextUrl.origin;
      const postsWithVotes = (posts || []).map((post) => ({
        ...post,
        user_vote: userVotes[post.id] || null,
        permalink: `${baseUrl}/post/${post.id}`,
      }));

      return NextResponse.json({
        posts: postsWithVotes,
        followedTags,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      });
    }

    // Build the query
    let query = supabase
      .from("posts")
      .select(
        `
        *,
        author:profiles!author_id (
          id,
          username,
          full_name,
          avatar_url,
          account_type,
          verified,
          verification_type
        )
      `,
        { count: "exact" }
      );

    // Filter by tag
    if (tag) {
      query = query.contains("tags", [tag]);
    }

    // Apply sorting
    switch (sort) {
      case "new":
        query = query.order("created_at", { ascending: false });
        break;
      case "top":
        query = query.order("score", { ascending: false });
        break;
      case "rising": {
        // Rising: recent posts (last 24h) sorted by score
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        query = query
          .gte("created_at", oneDayAgo)
          .order("score", { ascending: false });
        break;
      }
      case "hot":
      default:
        // Hot: we'll fetch and sort in-memory using Reddit-style formula
        // For hot, fetch more than needed and sort client-side
        query = query.order("created_at", { ascending: false });
        break;
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: posts, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // For "hot" sort, apply Reddit-style ranking
    let sortedPosts = posts || [];
    if (sort === "hot" && sortedPosts.length > 0) {
      const now = Date.now();
      sortedPosts = [...sortedPosts].sort((a, b) => {
        const ageA = (now - new Date(a.created_at).getTime()) / (1000 * 60 * 60); // hours
        const ageB = (now - new Date(b.created_at).getTime()) / (1000 * 60 * 60);
        const hotA = (a.score || 0) / Math.pow(ageA + 2, 1.8);
        const hotB = (b.score || 0) / Math.pow(ageB + 2, 1.8);
        return hotB - hotA;
      });
    }

    // If user is authenticated, fetch their votes for these posts
    let userVotes: Record<string, number> = {};
    if (currentUserId && sortedPosts.length > 0) {
      const postIds = sortedPosts.map((p) => p.id);
      const { data: votes } = await supabase
        .from("post_votes")
        .select("post_id, vote_type")
        .eq("user_id", currentUserId)
        .in("post_id", postIds);

      if (votes) {
        for (const v of votes) {
          userVotes[v.post_id] = v.vote_type;
        }
      }
    }

    // Attach user_vote and permalink to each post
    const baseUrl = request.nextUrl.origin;
    const postsWithVotes = sortedPosts.map((post) => ({
      ...post,
      user_vote: userVotes[post.id] || null,
      permalink: `${baseUrl}/post/${post.id}`,
    }));

    return NextResponse.json({
      posts: postsWithVotes,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
