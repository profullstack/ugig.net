import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/users/:username/endorsements — list endorsements grouped by skill
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const skillFilter = searchParams.get("skill");

    // Get the authenticated user (optional — for "endorsed_by_current_user")
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    // Look up user by username
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, skills")
      .eq("username", username)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Build query — apply all .eq() filters before .order()
    let query = supabase
      .from("endorsements")
      .select(
        `
        *,
        endorser:profiles!endorsements_endorser_id_fkey (
          id, username, full_name, avatar_url
        )
      `
      )
      .eq("endorsed_id", profile.id);

    if (skillFilter) {
      query = query.eq("skill", skillFilter);
    }

    const { data: endorsements, error } = await query.order("created_at", {
      ascending: false,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Group by skill
    const groupedMap = new Map<
      string,
      {
        skill: string;
        count: number;
        endorsers: {
          id: string;
          username: string;
          full_name: string | null;
          avatar_url: string | null;
          comment: string | null;
          created_at: string;
        }[];
        endorsed_by_current_user: boolean;
      }
    >();

    for (const e of endorsements || []) {
      const endorser = e.endorser as {
        id: string;
        username: string;
        full_name: string | null;
        avatar_url: string | null;
      };

      if (!groupedMap.has(e.skill)) {
        groupedMap.set(e.skill, {
          skill: e.skill,
          count: 0,
          endorsers: [],
          endorsed_by_current_user: false,
        });
      }

      const group = groupedMap.get(e.skill)!;
      group.count++;
      group.endorsers.push({
        ...endorser,
        comment: e.comment,
        created_at: e.created_at,
      });

      if (currentUser && e.endorser_id === currentUser.id) {
        group.endorsed_by_current_user = true;
      }
    }

    // Sort groups: most endorsements first
    const grouped = Array.from(groupedMap.values()).sort(
      (a, b) => b.count - a.count
    );

    return NextResponse.json({
      data: grouped,
      total_endorsements: endorsements?.length || 0,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
