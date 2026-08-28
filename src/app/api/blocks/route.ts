import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";

// GET /api/blocks — the current user's block list
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const { data: blocks, error } = await supabase
      .from("user_blocks")
      .select("id, blocked_id, reason, created_at")
      .eq("blocker_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const blockedIds = (blocks ?? []).map((b) => b.blocked_id);

    if (blockedIds.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url")
      .in("id", blockedIds);

    const profileById = new Map(
      (profiles ?? []).map((p) => [p.id, p] as const)
    );

    const data = (blocks ?? []).map((block) => ({
      id: block.id,
      reason: block.reason,
      created_at: block.created_at,
      user: profileById.get(block.blocked_id) ?? null,
    }));

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
