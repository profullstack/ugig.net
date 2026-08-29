import type { TeamMemberStatus, TeamProjectStatus, TeamRole } from "@/lib/teams";

export type TeamProfile = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

export type TeamMember = {
  id: string;
  team_id: string;
  user_id: string | null;
  invited_email: string | null;
  role: TeamRole;
  title: string | null;
  billable_rate_usd: number | null;
  status: TeamMemberStatus;
  created_at: string;
  profile: TeamProfile | null;
};

export type TeamProject = {
  id: string;
  team_id: string;
  name: string;
  description: string | null;
  status: TeamProjectStatus;
  billable_rate_usd: number | null;
  created_at: string;
};

export type ProjectAssignment = {
  project_id: string;
  member_id: string;
  billable_rate_usd: number | null;
};

export type Team = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  billable_rate_usd: number;
  created_at: string;
};

export type TeamSummary = Team & {
  role: TeamRole;
  member_count: number;
  project_count: number;
};

/** Display name for a member, whether they have an account or a pending invite. */
export function memberDisplayName(member: TeamMember): string {
  return (
    member.profile?.full_name ||
    member.profile?.username ||
    member.invited_email ||
    "Unknown member"
  );
}
