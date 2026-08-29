import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { updateTeamMemberSchema } from "@/lib/teams";
import { getTeamAccess } from "@/lib/teams-access";

const MEMBER_SELECT = `
  id, team_id, user_id, invited_email, role, title, billable_rate_usd, status,
  created_at, updated_at,
  profile:profiles!user_id (id, username, full_name, avatar_url)
`;

type RouteParams = { params: Promise<{ team: string; memberId: string }> };

// PATCH /api/teams/[team]/members/[memberId] — role, title, rate or status
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { team: idOrSlug, memberId } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;
    const client = supabase as any;

    const access = await getTeamAccess(client, idOrSlug, user.id);
    if (!access) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }
    if (!access.canManage) {
      return NextResponse.json(
        { error: "Only team owners and admins can change members" },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }

    const parsed = updateTeamMemberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data: existing } = await client
      .from("team_members")
      .select("id, user_id, role")
      .eq("id", memberId)
      .eq("team_id", access.team.id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // The owner's own row anchors the team; demoting or deactivating it would
    // leave a team nobody can manage.
    const isOwnerRow = existing.user_id === access.team.owner_id;
    if (isOwnerRow && (updates.role !== undefined || updates.status !== undefined)) {
      return NextResponse.json(
        { error: "The team owner's role and status cannot be changed" },
        { status: 400 }
      );
    }
    if (updates.role === "owner") {
      return NextResponse.json(
        { error: "A team has one owner. Use the admin role instead." },
        { status: 400 }
      );
    }

    const { data, error } = await client
      .from("team_members")
      .update(updates)
      .eq("id", memberId)
      .eq("team_id", access.team.id)
      .select(MEMBER_SELECT)
      .single();

    if (error) {
      console.error("[PATCH /api/teams/[team]/members/[memberId]] Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[PATCH /api/teams/[team]/members/[memberId]] Unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

// DELETE /api/teams/[team]/members/[memberId] — remove from the roster
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { team: idOrSlug, memberId } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;
    const client = supabase as any;

    const access = await getTeamAccess(client, idOrSlug, user.id);
    if (!access) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }
    if (!access.canManage) {
      return NextResponse.json(
        { error: "Only team owners and admins can remove members" },
        { status: 403 }
      );
    }

    const { data: existing } = await client
      .from("team_members")
      .select("id, user_id")
      .eq("id", memberId)
      .eq("team_id", access.team.id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    if (existing.user_id === access.team.owner_id) {
      return NextResponse.json(
        { error: "The team owner cannot be removed. Delete the team instead." },
        { status: 400 }
      );
    }

    // Assignments cascade, so the person leaves every project with them.
    const { error } = await client
      .from("team_members")
      .delete()
      .eq("id", memberId)
      .eq("team_id", access.team.id);

    if (error) {
      console.error("[DELETE /api/teams/[team]/members/[memberId]] Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/teams/[team]/members/[memberId]] Unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
