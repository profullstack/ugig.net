import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";

// POST /api/posts/[id]/upvote - Upvote a post (toggle)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const rl = checkRateLimit(getRateLimitIdentifier(request, user.id), "write");
    if (!rl.allowed) return rateLimitExceeded(rl);

    // Check post exists
    const { data: post } = await supabase
      .from("posts")
      .select("id, upvotes, downvotes, score")
      .eq("id", postId)
      .single();

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Check if user already voted
    const { data: existingVote } = await supabase
      .from("post_votes")
      .select("id, vote_type")
      .eq("post_id", postId)
      .eq("user_id", user.id)
      .single();

    let newUpvotes = post.upvotes;
    let newDownvotes = post.downvotes;

    if (existingVote) {
      if (existingVote.vote_type === 1) {
        // Already upvoted — remove vote (toggle off)
        await supabase
          .from("post_votes")
          .delete()
          .eq("id", existingVote.id);
        newUpvotes -= 1;
      } else {
        // Was downvote — switch to upvote
        await supabase
          .from("post_votes")
          .update({ vote_type: 1 })
          .eq("id", existingVote.id);
        newUpvotes += 1;
        newDownvotes -= 1;
      }
    } else {
      // No existing vote — create upvote
      await supabase
        .from("post_votes")
        .insert({
          post_id: postId,
          user_id: user.id,
          vote_type: 1,
        });
      newUpvotes += 1;
    }

    // Update post vote counts
    const newScore = newUpvotes - newDownvotes;
    await supabase
      .from("posts")
      .update({
        upvotes: newUpvotes,
        downvotes: newDownvotes,
        score: newScore,
      })
      .eq("id", postId);

    // Determine user's final vote state
    const userVote = existingVote?.vote_type === 1 ? null : 1;

    return NextResponse.json({
      upvotes: newUpvotes,
      downvotes: newDownvotes,
      score: newScore,
      user_vote: userVote,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
