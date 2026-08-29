import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, FolderKanban, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatHourlyRate } from "@/lib/teams";
import { CreateTeamForm } from "@/components/teams/CreateTeamForm";
import type { TeamSummary } from "@/components/teams/types";

export const metadata = {
  title: "Teams | ugig.net",
  description: "Manage your org's teams, members, projects and billable rates.",
};

export default async function TeamsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/teams");
  }

  const client = supabase as any;

  // RLS limits `teams` to the ones the viewer owns or belongs to.
  const { data: teams } = await client
    .from("teams")
    .select("*")
    .order("created_at", { ascending: false });

  const teamIds = (teams || []).map((t: { id: string }) => t.id);

  const [membersResult, projectsResult] = teamIds.length
    ? await Promise.all([
        client.from("team_members").select("team_id, user_id, role, status").in("team_id", teamIds),
        client.from("team_projects").select("team_id, status").in("team_id", teamIds),
      ])
    : [{ data: [] }, { data: [] }];

  const members = membersResult.data || [];
  const projects = projectsResult.data || [];

  const summaries: TeamSummary[] = (teams || []).map((team: TeamSummary) => {
    const roster = members.filter(
      (m: { team_id: string; status: string }) => m.team_id === team.id && m.status !== "removed"
    );
    const mine = roster.find((m: { user_id: string | null }) => m.user_id === user.id);
    return {
      ...team,
      role: mine?.role ?? (team.owner_id === user.id ? "owner" : "member"),
      member_count: roster.length,
      project_count: projects.filter(
        (p: { team_id: string; status: string }) => p.team_id === team.id && p.status !== "archived"
      ).length,
    };
  });

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Teams</h1>
        <p className="text-muted-foreground">
          Group people into an org, give them projects, and set the rate you bill their time at.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {summaries.length === 0 ? (
            <div className="p-8 bg-card rounded-lg border border-border text-center">
              <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <h2 className="text-lg font-semibold mb-1">No teams yet</h2>
              <p className="text-sm text-muted-foreground">
                Create your first team to start adding members and projects.
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {summaries.map((team) => (
                <li key={team.id}>
                  <Link
                    href={`/teams/${team.slug}`}
                    className="block p-6 bg-card rounded-lg border border-border shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h2 className="text-lg font-semibold truncate">{team.name}</h2>
                        {team.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {team.description}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <Users className="h-4 w-4" />
                            {team.member_count} {team.member_count === 1 ? "member" : "members"}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <FolderKanban className="h-4 w-4" />
                            {team.project_count} {team.project_count === 1 ? "project" : "projects"}
                          </span>
                          <span className="font-medium text-foreground">
                            {formatHourlyRate(team.billable_rate_usd)}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-muted text-xs capitalize">
                            {team.role}
                          </span>
                        </div>
                      </div>
                      <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <CreateTeamForm />
        </div>
      </div>
    </main>
  );
}
