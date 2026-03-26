import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { z } from "zod";

const voteSchema = z.object({
  option_id: z.string().uuid(),
});

// POST /api/posts/[id]/poll/vote - Vote on a poll
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

    const body = await request.json();
    const validation = voteSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    const { option_id } = validation.data;

    // Verify option belongs to this post
    const { data: option } = await (supabase as any)
      .from("poll_options")
      .select("id, post_id")
      .eq("id", option_id)
      .eq("post_id", postId)
      .single();

    if (!option) {
      return NextResponse.json(
        { error: "Poll option not found" },
        { status: 404 }
      );
    }

    // Upsert vote (change vote if already voted)
    // First delete existing vote
    await (supabase as any)
      .from("poll_votes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", user.id);

    // Insert new vote
    const { error } = await (supabase as any)
      .from("poll_votes")
      .insert({
        post_id: postId,
        option_id,
        user_id: user.id,
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// GET /api/posts/[id]/poll/vote - Get poll results
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const auth = await getAuthContext(request);
    const userId = auth?.user?.id;

    // Get options with vote counts
    const { data: options } = await (auth?.supabase || (await import("@/lib/supabase/server")).createClient() as any)
      .from("poll_options")
      .select("id, text, position")
      .eq("post_id", postId)
      .order("position", { ascending: true });

    if (!options || options.length === 0) {
      return NextResponse.json({ options: [], total_votes: 0, user_vote: null });
    }

    const supabase = auth?.supabase || await (await import("@/lib/supabase/server")).createClient();

    // Get vote counts per option
    const { data: votes } = await (supabase as any)
      .from("poll_votes")
      .select("option_id")
      .eq("post_id", postId);

    const voteCounts: Record<string, number> = {};
    for (const v of votes || []) {
      voteCounts[v.option_id] = (voteCounts[v.option_id] || 0) + 1;
    }

    const totalVotes = (votes || []).length;

    // Get user's vote
    let userVote: string | null = null;
    if (userId) {
      const { data: myVote } = await (supabase as any)
        .from("poll_votes")
        .select("option_id")
        .eq("post_id", postId)
        .eq("user_id", userId)
        .single();
      userVote = myVote?.option_id || null;
    }

    const optionsWithCounts = options.map((o: any) => ({
      id: o.id,
      text: o.text,
      position: o.position,
      votes: voteCounts[o.id] || 0,
      percentage: totalVotes > 0 ? Math.round(((voteCounts[o.id] || 0) / totalVotes) * 100) : 0,
    }));

    return NextResponse.json({
      options: optionsWithCounts,
      total_votes: totalVotes,
      user_vote: userVote,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
