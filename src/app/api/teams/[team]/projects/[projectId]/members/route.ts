import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { assignProjectMemberSchema } from "@/lib/teams";
import { getTeamAccess, type TeamAccess } from "@/lib/teams-access";

type RouteParams = { params: Promise<{ team: string; projectId: string }> };

/**
 * Resolve the team and the project together, so a project id from another
 * team is a 404 rather than a cross-team write.
 */
async function loadProject(
  client: any,
  idOrSlug: string,
  projectId: string,
  userId: string
): Promise<{ error: NextResponse | null; access: TeamAccess | null }> {
  const access = await getTeamAccess(client, idOrSlug, userId);
  if (!access) {
    return { error: NextResponse.json({ error: "Team not found" }, { status: 404 }), access: null };
  }

  const { data: project } = await client
    .from("team_projects")
    .select("id")
    .eq("id", projectId)
    .eq("team_id", access.team.id)
    .maybeSingle();

  if (!project) {
    return {
      error: NextResponse.json({ error: "Project not found" }, { status: 404 }),
      access: null,
    };
  }
  return { error: null, access };
}

// GET — who is on this project, with their assignment rate override
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { team: idOrSlug, projectId } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const client = auth.supabase as any;

    const loaded = await loadProject(client, idOrSlug, projectId, auth.user.id);
    if (loaded.error) return loaded.error;

    const { data, error } = await client
      .from("team_project_members")
      .select(
        `
        project_id, member_id, billable_rate_usd, created_at,
        member:team_members!member_id (
          id, user_id, invited_email, role, title, billable_rate_usd, status,
          profile:profiles!user_id (id, username, full_name, avatar_url)
        )
      `
      )
      .eq("project_id", projectId);

    if (error) {
      console.error("[GET project members] Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data: data || [] });
  } catch (err) {
    console.error("[GET project members] Unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

// POST — assign a member to the project, or update their assignment rate
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { team: idOrSlug, projectId } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const client = auth.supabase as any;

    const loaded = await loadProject(client, idOrSlug, projectId, auth.user.id);
    if (loaded.error) return loaded.error;
    if (!loaded.access!.canManage) {
      return NextResponse.json(
        { error: "Only team owners and admins can assign members" },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }

    const parsed = assignProjectMemberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const input = parsed.data;

    const { data: member } = await client
      .from("team_members")
      .select("id")
      .eq("id", input.member_id)
      .eq("team_id", loaded.access!.team.id)
      .maybeSingle();

    if (!member) {
      return NextResponse.json({ error: "That member is not on this team" }, { status: 404 });
    }

    const { data, error } = await client
      .from("team_project_members")
      .upsert(
        {
          project_id: projectId,
          member_id: input.member_id,
          billable_rate_usd: input.billable_rate_usd ?? null,
        },
        { onConflict: "project_id,member_id" }
      )
      .select("project_id, member_id, billable_rate_usd, created_at")
      .single();

    if (error) {
      console.error("[POST project members] Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("[POST project members] Unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

// DELETE ?member_id=… — take someone off the project
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { team: idOrSlug, projectId } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const client = auth.supabase as any;

    const memberId = request.nextUrl.searchParams.get("member_id");
    if (!memberId) {
      return NextResponse.json({ error: "member_id is required" }, { status: 400 });
    }

    const loaded = await loadProject(client, idOrSlug, projectId, auth.user.id);
    if (loaded.error) return loaded.error;
    if (!loaded.access!.canManage) {
      return NextResponse.json(
        { error: "Only team owners and admins can unassign members" },
        { status: 403 }
      );
    }

    const { error } = await client
      .from("team_project_members")
      .delete()
      .eq("project_id", projectId)
      .eq("member_id", memberId);

    if (error) {
      console.error("[DELETE project members] Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE project members] Unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
