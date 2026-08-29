import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { updateTeamSchema } from "@/lib/teams";
import { getTeamAccess, isUniqueViolation } from "@/lib/teams-access";

const MEMBER_SELECT = `
  id, team_id, user_id, invited_email, role, title, billable_rate_usd, status,
  created_at, updated_at,
  profile:profiles!user_id (id, username, full_name, avatar_url)
`;

// GET /api/teams/[team] — the team with its roster, projects and assignments
export async function GET(request: NextRequest, { params }: { params: Promise<{ team: string }> }) {
  try {
    const { team: idOrSlug } = await params;
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

    const [membersResult, projectsResult] = await Promise.all([
      client
        .from("team_members")
        .select(MEMBER_SELECT)
        .eq("team_id", access.team.id)
        .order("created_at", { ascending: true }),
      client
        .from("team_projects")
        .select("*")
        .eq("team_id", access.team.id)
        .order("created_at", { ascending: false }),
    ]);

    if (membersResult.error) {
      console.error("[GET /api/teams/[team]] members error:", membersResult.error);
      return NextResponse.json({ error: membersResult.error.message }, { status: 400 });
    }

    const projects = projectsResult.data || [];
    const projectIds = projects.map((p: { id: string }) => p.id);
    const { data: assignments } = projectIds.length
      ? await client
          .from("team_project_members")
          .select("project_id, member_id, billable_rate_usd, created_at")
          .in("project_id", projectIds)
      : { data: [] };

    return NextResponse.json({
      data: {
        ...access.team,
        role: access.role,
        can_manage: access.canManage,
        is_owner: access.isOwner,
        members: membersResult.data || [],
        projects,
        assignments: assignments || [],
      },
    });
  } catch (err) {
    console.error("[GET /api/teams/[team]] Unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

// PATCH /api/teams/[team] — rename, re-slug, or change the team billable rate
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ team: string }> }
) {
  try {
    const { team: idOrSlug } = await params;
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
        { error: "Only team owners and admins can change the team" },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }

    const parsed = updateTeamSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await client
      .from("teams")
      .update(updates)
      .eq("id", access.team.id)
      .select("*")
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        return NextResponse.json({ error: "That team URL is already taken" }, { status: 409 });
      }
      console.error("[PATCH /api/teams/[team]] Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[PATCH /api/teams/[team]] Unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

// DELETE /api/teams/[team] — owner only; members and projects cascade
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ team: string }> }
) {
  try {
    const { team: idOrSlug } = await params;
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
    if (!access.isOwner) {
      return NextResponse.json({ error: "Only the team owner can delete it" }, { status: 403 });
    }

    const { error } = await client.from("teams").delete().eq("id", access.team.id);
    if (error) {
      console.error("[DELETE /api/teams/[team]] Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/teams/[team]] Unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
