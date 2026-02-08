import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";

// POST /api/posts/[id]/comments/[commentId]/vote - Vote on a comment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { id, commentId } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const rl = checkRateLimit(getRateLimitIdentifier(request, user.id), "write");
    if (!rl.allowed) return rateLimitExceeded(rl);

    // Parse vote direction from body
    const body = await request.json().catch(() => ({}));
    const direction = body.direction as string;
    if (direction !== "up" && direction !== "down") {
      return NextResponse.json(
        { error: 'Invalid direction. Must be "up" or "down".' },
        { status: 400 }
      );
    }
    const voteType = direction === "up" ? 1 : -1;

    // Verify comment exists and belongs to this post
    const { data: comment } = await supabase
      .from("post_comments")
      .select("id, post_id")
      .eq("id", commentId)
      .eq("post_id", id)
      .single();

    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    // Check existing vote
    const { data: existingVote } = await supabase
      .from("post_comment_votes")
      .select("id, vote_type")
      .eq("comment_id", commentId)
      .eq("user_id", user.id)
      .single();

    let userVote: number | null;

    if (existingVote) {
      if (existingVote.vote_type === voteType) {
        // Same vote — toggle off
        await supabase
          .from("post_comment_votes")
          .delete()
          .eq("id", existingVote.id);
        userVote = null;
      } else {
        // Different vote — switch
        await supabase
          .from("post_comment_votes")
          .update({ vote_type: voteType })
          .eq("id", existingVote.id);
        userVote = voteType;
      }
    } else {
      // New vote
      await supabase
        .from("post_comment_votes")
        .insert({
          comment_id: commentId,
          user_id: user.id,
          vote_type: voteType,
        });
      userVote = voteType;
    }

    // Read back updated counts
    const { data: updated } = await supabase
      .from("post_comments")
      .select("upvotes, downvotes, score")
      .eq("id", commentId)
      .single();

    return NextResponse.json({
      upvotes: updated?.upvotes ?? 0,
      downvotes: updated?.downvotes ?? 0,
      score: updated?.score ?? 0,
      user_vote: userVote,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
