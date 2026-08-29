import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createTeamSchema, slugifyTeamName } from "@/lib/teams";
import { isUniqueViolation, teamSlugCandidate } from "@/lib/teams-access";

// GET /api/teams — teams the caller owns or belongs to
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;
    const client = supabase as any;

    // API-key auth hands back a service-role client that bypasses RLS, so the
    // caller's teams are resolved explicitly rather than trusted to policies.
    const { data: memberships } = await client
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id)
      .eq("status", "active");

    const memberTeamIds = (memberships || []).map((m: { team_id: string }) => m.team_id);

    const { data: teams, error } = await client
      .from("teams")
      .select("*")
      .or(
        memberTeamIds.length > 0
          ? `owner_id.eq.${user.id},id.in.(${memberTeamIds.join(",")})`
          : `owner_id.eq.${user.id}`
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/teams] Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const teamIds = (teams || []).map((t: { id: string }) => t.id);
    if (teamIds.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const [membersResult, projectsResult] = await Promise.all([
      client.from("team_members").select("team_id, user_id, role, status").in("team_id", teamIds),
      client.from("team_projects").select("team_id, status").in("team_id", teamIds),
    ]);

    const members = membersResult.data || [];
    const projects = projectsResult.data || [];

    const data = (teams || []).map((team: { id: string; owner_id: string }) => {
      const roster = members.filter(
        (m: { team_id: string; status: string }) => m.team_id === team.id && m.status !== "removed"
      );
      const mine = roster.find((m: { user_id: string | null }) => m.user_id === user.id);
      return {
        ...team,
        role: mine?.role ?? (team.owner_id === user.id ? "owner" : "member"),
        member_count: roster.length,
        project_count: projects.filter(
          (p: { team_id: string; status: string }) =>
            p.team_id === team.id && p.status !== "archived"
        ).length,
      };
    });

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[GET /api/teams] Unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

// POST /api/teams — create a team owned by the caller
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;
    const client = supabase as any;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }

    const parsed = createTeamSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const input = parsed.data;

    const base = input.slug || slugifyTeamName(input.name);
    if (!base) {
      return NextResponse.json(
        { error: "Team name must contain at least one letter or number" },
        { status: 400 }
      );
    }

    // Slugs are globally unique but RLS hides other people's teams, so the
    // insert itself is the only honest availability check.
    const attempts = input.slug ? 1 : 10;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const slug = teamSlugCandidate(base, attempt);
      const { data, error } = await client
        .from("teams")
        .insert({
          owner_id: user.id,
          name: input.name,
          slug,
          description: input.description ?? null,
          billable_rate_usd: input.billable_rate_usd,
        })
        .select("*")
        .single();

      if (!error) {
        return NextResponse.json({ data }, { status: 201 });
      }
      if (!isUniqueViolation(error)) {
        console.error("[POST /api/teams] Supabase error:", error);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (input.slug) {
        return NextResponse.json({ error: "That team URL is already taken" }, { status: 409 });
      }
    }

    return NextResponse.json(
      { error: "Could not find an available team URL. Try a different name." },
      { status: 409 }
    );
  } catch (err) {
    console.error("[POST /api/teams] Unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
