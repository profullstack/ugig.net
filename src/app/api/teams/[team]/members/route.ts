import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { addTeamMemberSchema } from "@/lib/teams";
import { getTeamAccess, isUniqueViolation } from "@/lib/teams-access";

const MEMBER_SELECT = `
  id, team_id, user_id, invited_email, role, title, billable_rate_usd, status,
  created_at, updated_at,
  profile:profiles!user_id (id, username, full_name, avatar_url)
`;

// GET /api/teams/[team]/members — the roster, visible to every team member
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
      .from("team_members")
      .select(MEMBER_SELECT)
      .eq("team_id", access.team.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[GET /api/teams/[team]/members] Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data: data || [] });
  } catch (err) {
    console.error("[GET /api/teams/[team]/members] Unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

// POST /api/teams/[team]/members — add by user id, username, or email invite
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
        { error: "Only team owners and admins can add members" },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }

    const parsed = addTeamMemberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const input = parsed.data;

    if (input.role === "owner") {
      return NextResponse.json(
        { error: "A team has one owner. Add the person as an admin instead." },
        { status: 400 }
      );
    }

    let userId: string | null = input.user_id ?? null;
    if (!userId && input.username) {
      const { data: profile } = await client
        .from("profiles")
        .select("id")
        .ilike("username", input.username)
        .maybeSingle();
      if (!profile) {
        return NextResponse.json({ error: `No user named ${input.username}` }, { status: 404 });
      }
      userId = profile.id;
    } else if (userId) {
      const { data: profile } = await client
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();
      if (!profile) {
        return NextResponse.json({ error: "No such user" }, { status: 404 });
      }
    }

    // Email invites are placeholders: nothing links them to an account until a
    // manager attaches a username, since profiles do not carry email addresses.
    const insert = {
      team_id: access.team.id,
      user_id: userId,
      invited_email: userId ? null : (input.email?.toLowerCase() ?? null),
      role: input.role,
      title: input.title ?? null,
      billable_rate_usd: input.billable_rate_usd ?? null,
      status: userId ? "active" : "invited",
    };

    const { data, error } = await client
      .from("team_members")
      .insert(insert)
      .select(MEMBER_SELECT)
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        return NextResponse.json({ error: "That person is already on the team" }, { status: 409 });
      }
      console.error("[POST /api/teams/[team]/members] Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/teams/[team]/members] Unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
