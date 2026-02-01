import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";

// POST /api/posts/[id]/downvote - Downvote a post (toggle)
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
      .select("id")
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

    let userVote: number | null;

    if (existingVote) {
      if (existingVote.vote_type === -1) {
        // Already downvoted — remove vote (toggle off)
        await supabase
          .from("post_votes")
          .delete()
          .eq("id", existingVote.id);
        userVote = null;
      } else {
        // Was upvote — switch to downvote
        await supabase
          .from("post_votes")
          .update({ vote_type: -1 })
          .eq("id", existingVote.id);
        userVote = -1;
      }
    } else {
      // No existing vote — create downvote
      await supabase
        .from("post_votes")
        .insert({
          post_id: postId,
          user_id: user.id,
          vote_type: -1,
        });
      userVote = -1;
    }

    // Read back the updated counts (recalculated by DB trigger)
    const { data: updated } = await supabase
      .from("posts")
      .select("upvotes, downvotes, score")
      .eq("id", postId)
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
