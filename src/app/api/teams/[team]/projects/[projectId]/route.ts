import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { updateTeamProjectSchema } from "@/lib/teams";
import { getTeamAccess, isUniqueViolation } from "@/lib/teams-access";

type RouteParams = { params: Promise<{ team: string; projectId: string }> };

// PATCH /api/teams/[team]/projects/[projectId] — rename, restatus, re-rate
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { team: idOrSlug, projectId } = await params;
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
        { error: "Only team owners and admins can change projects" },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }

    const parsed = updateTeamProjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await client
      .from("team_projects")
      .update(updates)
      .eq("id", projectId)
      .eq("team_id", access.team.id)
      .select("*")
      .maybeSingle();

    if (error) {
      if (isUniqueViolation(error)) {
        return NextResponse.json(
          { error: "This team already has a project with that name" },
          { status: 409 }
        );
      }
      console.error("[PATCH /api/teams/[team]/projects/[projectId]] Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!data) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[PATCH /api/teams/[team]/projects/[projectId]] Unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

// DELETE /api/teams/[team]/projects/[projectId] — assignments cascade
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { team: idOrSlug, projectId } = await params;
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
        { error: "Only team owners and admins can delete projects" },
        { status: 403 }
      );
    }

    const { data: existing } = await client
      .from("team_projects")
      .select("id")
      .eq("id", projectId)
      .eq("team_id", access.team.id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const { error } = await client
      .from("team_projects")
      .delete()
      .eq("id", projectId)
      .eq("team_id", access.team.id);

    if (error) {
      console.error("[DELETE /api/teams/[team]/projects/[projectId]] Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/teams/[team]/projects/[projectId]] Unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
