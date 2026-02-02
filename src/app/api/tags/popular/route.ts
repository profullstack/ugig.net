import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/tags/popular — list popular tags with gig and follower counts
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1),
      200
    );

    const supabase = await createClient();

    // Fetch all active gigs with their skills_required
    const { data: gigs, error: gigsError } = await supabase
      .from("gigs")
      .select("skills_required")
      .eq("status", "active");

    if (gigsError) {
      return NextResponse.json(
        { error: gigsError.message },
        { status: 400 }
      );
    }

    // Count gigs per tag (skills_required is the tag array on gigs)
    const gigCountMap = new Map<string, number>();
    for (const gig of gigs || []) {
      const skills = gig.skills_required || [];
      for (const skill of skills) {
        const normalized = skill.trim();
        if (normalized) {
          gigCountMap.set(normalized, (gigCountMap.get(normalized) || 0) + 1);
        }
      }
    }

    // Fetch all tag follows and count per tag
    const { data: follows, error: followsError } = await supabase
      .from("tag_follows")
      .select("tag");

    if (followsError) {
      // tag_follows table might not exist yet — proceed with zero follower counts
      console.warn("Could not fetch tag_follows:", followsError.message);
    }

    const followerCountMap = new Map<string, number>();
    for (const follow of follows || []) {
      const tag = follow.tag?.trim();
      if (tag) {
        followerCountMap.set(tag, (followerCountMap.get(tag) || 0) + 1);
      }
    }

    // Merge all unique tags from both sources
    const allTags = new Set<string>([
      ...gigCountMap.keys(),
      ...followerCountMap.keys(),
    ]);

    const tags = Array.from(allTags).map((tag) => ({
      tag,
      gig_count: gigCountMap.get(tag) || 0,
      follower_count: followerCountMap.get(tag) || 0,
    }));

    // Sort by follower_count desc, then gig_count desc
    tags.sort((a, b) => {
      if (b.follower_count !== a.follower_count) {
        return b.follower_count - a.follower_count;
      }
      return b.gig_count - a.gig_count;
    });

    // Apply limit
    const limited = tags.slice(0, limit);

    return NextResponse.json({ tags: limited });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
