import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createTeamProjectSchema } from "@/lib/teams";
import { getTeamAccess, isUniqueViolation } from "@/lib/teams-access";

// GET /api/teams/[team]/projects — projects, visible to every team member
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

    const { data, error } = await client
      .from("team_projects")
      .select("*")
      .eq("team_id", access.team.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/teams/[team]/projects] Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data: data || [] });
  } catch (err) {
    console.error("[GET /api/teams/[team]/projects] Unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

// POST /api/teams/[team]/projects — create a project
export async function POST(
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
        { error: "Only team owners and admins can create projects" },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }

    const parsed = createTeamProjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const input = parsed.data;

    const { data, error } = await client
      .from("team_projects")
      .insert({
        team_id: access.team.id,
        name: input.name,
        description: input.description ?? null,
        status: input.status,
        billable_rate_usd: input.billable_rate_usd ?? null,
      })
      .select("*")
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        return NextResponse.json(
          { error: "This team already has a project with that name" },
          { status: 409 }
        );
      }
      console.error("[POST /api/teams/[team]/projects] Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/teams/[team]/projects] Unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
