import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/mcp/[slug]/vote - Upvote/downvote an MCP listing (toggle)
 *
 * Body: { vote_type: 1 | -1 }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const voteType = body.vote_type;
    if (voteType !== 1 && voteType !== -1) {
      return NextResponse.json({ error: "vote_type must be 1 or -1" }, { status: 400 });
    }

    const admin = createServiceClient();

    // Fetch listing
    const { data: listing } = await admin
      .from("mcp_listings" as any)
      .select("id, status")
      .eq("slug", slug)
      .single();

    if (!listing) {
      return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
    }

    if ((listing as any).status !== "active") {
      return NextResponse.json({ error: "MCP server is not available" }, { status: 400 });
    }

    const listingId = (listing as any).id;

    // Check existing vote
    const { data: existingVote } = await admin
      .from("mcp_votes" as any)
      .select("id, vote_type")
      .eq("listing_id", listingId)
      .eq("user_id", auth.user.id)
      .single();

    let userVote: number | null;

    if (existingVote) {
      if ((existingVote as any).vote_type === voteType) {
        // Same vote → toggle off (remove)
        await admin
          .from("mcp_votes" as any)
          .delete()
          .eq("id", (existingVote as any).id);
        userVote = null;
      } else {
        // Different vote → switch
        await admin
          .from("mcp_votes" as any)
          .update({ vote_type: voteType })
          .eq("id", (existingVote as any).id);
        userVote = voteType;
      }
    } else {
      // No existing → create
      await admin
        .from("mcp_votes" as any)
        .insert({
          listing_id: listingId,
          user_id: auth.user.id,
          vote_type: voteType,
        });
      userVote = voteType;
    }

    // Read updated counts (recalculated by DB trigger)
    const { data: updated } = await admin
      .from("mcp_listings" as any)
      .select("upvotes, downvotes, score")
      .eq("id", listingId)
      .single();

    return NextResponse.json({
      upvotes: (updated as any)?.upvotes ?? 0,
      downvotes: (updated as any)?.downvotes ?? 0,
      score: (updated as any)?.score ?? 0,
      user_vote: userVote,
    });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
