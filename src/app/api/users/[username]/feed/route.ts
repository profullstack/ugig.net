import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/users/:username/feed - Public posts + comments by user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const offset = parseInt(searchParams.get("offset") || "0");

    const supabase = await createClient();

    // Look up user
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch posts
    const { data: rawPosts } = await supabase
      .from("posts")
      .select("id, title, content, created_at, upvote_count, comment_count")
      .eq("author_id", profile.id)
      .order("created_at", { ascending: false })
      .range(0, limit + offset - 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const posts = (rawPosts || []) as any[];

    // Fetch comments with their parent post info
    const { data: rawComments } = await supabase
      .from("post_comments")
      .select("id, content, created_at, post_id")
      .eq("author_id", profile.id)
      .order("created_at", { ascending: false })
      .range(0, limit + offset - 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comments = (rawComments || []) as any[];

    // Get post titles for comments
    const postIds = [...new Set(comments.map((c: any) => c.post_id).filter(Boolean))];
    const postTitleMap: Record<string, string> = {};
    if (postIds.length > 0) {
      const { data: postTitles } = await supabase
        .from("posts")
        .select("id, title")
        .in("id", postIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of (postTitles || []) as any[]) {
        postTitleMap[p.id] = p.title;
      }
    }

    // Merge and sort by created_at
    const feedItems = [
      ...posts.map((p: any) => ({
        type: "post" as const,
        id: p.id,
        title: p.title,
        summary: p.content?.slice(0, 200) || "",
        created_at: p.created_at,
        upvotes: p.upvote_count || 0,
        comments: p.comment_count || 0,
        link: `/posts/${p.id}`,
      })),
      ...comments.map((c: any) => ({
        type: "comment" as const,
        id: c.id,
        title: postTitleMap[c.post_id] || "Unknown post",
        summary: c.content?.slice(0, 200) || "",
        created_at: c.created_at,
        link: `/posts/${c.post_id}#comment-${c.id}`,
      })),
    ]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(offset, offset + limit);

    return NextResponse.json({
      data: feedItems,
      pagination: {
        total: posts.length + comments.length,
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
