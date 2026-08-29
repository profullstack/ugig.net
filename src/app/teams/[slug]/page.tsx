import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canManageTeam, type TeamRole } from "@/lib/teams";
import { TeamWorkspace } from "@/components/teams/TeamWorkspace";
import type { ProjectAssignment, Team, TeamMember, TeamProject } from "@/components/teams/types";

const MEMBER_SELECT = `
  id, team_id, user_id, invited_email, role, title, billable_rate_usd, status, created_at,
  profile:profiles!user_id (id, username, full_name, avatar_url)
`;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return {
    title: `Team ${slug} | ugig.net`,
    description: "Team members, projects and billable rates.",
  };
}

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/teams/${slug}`);
  }

  const client = supabase as any;

  // RLS only returns a team the viewer owns or belongs to, so a miss here is
  // either "no such team" or "not yours" — both are a 404.
  const { data: team } = await client.from("teams").select("*").eq("slug", slug).maybeSingle();
  if (!team) {
    notFound();
  }

  const [membersResult, projectsResult] = await Promise.all([
    client
      .from("team_members")
      .select(MEMBER_SELECT)
      .eq("team_id", team.id)
      .order("created_at", { ascending: true }),
    client
      .from("team_projects")
      .select("*")
      .eq("team_id", team.id)
      .order("created_at", { ascending: false }),
  ]);

  const members = (membersResult.data || []) as TeamMember[];
  const projects = (projectsResult.data || []) as TeamProject[];
  const projectIds = projects.map((p) => p.id);

  const { data: assignmentRows } = projectIds.length
    ? await client
        .from("team_project_members")
        .select("project_id, member_id, billable_rate_usd")
        .in("project_id", projectIds)
    : { data: [] };

  const isOwner = team.owner_id === user.id;
  const membership = members.find((m) => m.user_id === user.id && m.status === "active");
  const role: TeamRole = membership?.role ?? (isOwner ? "owner" : "member");

  return (
    <TeamWorkspace
      team={team as Team}
      members={members}
      projects={projects}
      assignments={(assignmentRows || []) as ProjectAssignment[]}
      canManage={isOwner || canManageTeam(role)}
      isOwner={isOwner}
    />
  );
}
