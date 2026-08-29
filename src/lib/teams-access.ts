import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeamRole } from "@/lib/teams";

export type TeamRecord = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  billable_rate_usd: number;
  created_at: string;
  updated_at: string;
};

export type TeamAccess = {
  team: TeamRecord;
  /** The viewer's role, or null when they own the team without a roster row. */
  role: TeamRole | null;
  isOwner: boolean;
  canManage: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Look a team up by id or slug and report what the viewer may do with it.
 * Returns null when the team does not exist or RLS hides it, so callers can
 * answer 404 without leaking the difference.
 */
export async function getTeamAccess(
  supabase: SupabaseClient<any>,
  idOrSlug: string,
  userId: string
): Promise<TeamAccess | null> {
  const client = supabase as any;
  const query = client.from("teams").select("*");
  const { data: team } = await (
    UUID_RE.test(idOrSlug) ? query.eq("id", idOrSlug) : query.eq("slug", idOrSlug)
  ).maybeSingle();

  if (!team) return null;

  const { data: membership } = await client
    .from("team_members")
    .select("role, status")
    .eq("team_id", team.id)
    .eq("user_id", userId)
    .maybeSingle();

  const isOwner = team.owner_id === userId;
  const role: TeamRole | null =
    membership && membership.status === "active"
      ? (membership.role as TeamRole)
      : isOwner
        ? "owner"
        : null;

  if (!isOwner && role === null) return null;

  return {
    team: team as TeamRecord,
    role,
    isOwner,
    canManage: isOwner || role === "owner" || role === "admin",
  };
}

/**
 * Slugs are unique across every team, but RLS only shows a user their own, so
 * a "is this slug free?" query cannot see the collision. Candidates are meant
 * to be tried against the insert itself: `base`, then `base-2`, `base-3`, ...
 */
export function teamSlugCandidate(base: string, attempt: number): string {
  return attempt === 0 ? base : `${base.slice(0, 56)}-${attempt + 1}`;
}

/** Postgres unique violation, as surfaced by PostgREST. */
export function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}
