import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, createServiceClient } from "@/lib/auth/get-user";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";
import { sendEmail, upvoteMilestoneEmail } from "@/lib/email";

const UPVOTE_MILESTONES = [5, 10, 25, 50, 100, 250, 500, 1000];

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

    // Check post exists and get current upvote count + author info
    const { data: post } = await supabase
      .from("posts")
      .select("id, upvotes, content, author_id, author:profiles!author_id(full_name, username)")
      .eq("id", postId)
      .single();

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const previousUpvotes = post.upvotes ?? 0;

    // Check if user already voted
    const { data: existingVote } = await supabase
      .from("post_votes")
      .select("id, vote_type")
      .eq("post_id", postId)
      .eq("user_id", user.id)
      .single();

    let userVote: number | null;

    if (existingVote) {
      if (existingVote.vote_type === 1) {
        // Already upvoted — remove vote (toggle off)
        await supabase
          .from("post_votes")
          .delete()
          .eq("id", existingVote.id);
        userVote = null;
      } else {
        // Was downvote — switch to upvote
        await supabase
          .from("post_votes")
          .update({ vote_type: 1 })
          .eq("id", existingVote.id);
        userVote = 1;
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
      userVote = 1;
    }

    // Read back the updated counts (recalculated by DB trigger)
    const { data: updated } = await supabase
      .from("posts")
      .select("upvotes, downvotes, score")
      .eq("id", postId)
      .single();

    const newUpvotes = updated?.upvotes ?? 0;

    // Check for milestone crossing (only on upvote, not removal)
    if (userVote === 1 && newUpvotes > previousUpvotes) {
      const crossedMilestone = UPVOTE_MILESTONES.find(
        (m) => previousUpvotes < m && newUpvotes >= m
      );

      if (crossedMilestone && post.author_id !== user.id) {
        // Don't email if user upvoted their own post
        const author = post.author as { full_name: string | null; username: string | null } | null;
        // Get author's email from auth (not stored in profiles)
        const adminClient = createServiceClient();
        const { data: authorAuth } = await adminClient.auth.admin.getUserById(post.author_id);
        const authorEmail = authorAuth?.user?.email;

        if (authorEmail) {
          void sendEmail({
            to: authorEmail,
            ...upvoteMilestoneEmail({
              authorName: author?.full_name || author?.username || "there",
              postContentPreview: post.content || "",
              postId,
              milestone: crossedMilestone,
            }),
          });
        }
      }
    }

    return NextResponse.json({
      upvotes: newUpvotes,
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
