import type { SupabaseClient } from "@supabase/supabase-js";

// Supabase's generated types don't cover every table we touch here (bounties
// were added later), so the resolver takes a loosely-typed service client.

type ServiceClient = SupabaseClient<any, "public", any>;

export const BROADCAST_AUDIENCES = [
  "gig_applicants",
  "bounty_submitters",
  "my_people",
  "all_users",
] as const;

export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number];

/** Audiences only a platform admin may target. */
export const ADMIN_ONLY_AUDIENCES: readonly BroadcastAudience[] = ["all_users"];

export const APPLICATION_STATUSES = [
  "pending",
  "reviewing",
  "shortlisted",
  "accepted",
  "rejected",
  "withdrawn",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/**
 * Hard ceiling on a single broadcast. The thread is a group conversation, so
 * every recipient lands in one participant_ids array — this keeps that array,
 * the notification fan-out, and the email fan-out bounded. Sends above the cap
 * are truncated and the response reports it rather than silently dropping
 * recipients.
 */
export const MAX_BROADCAST_RECIPIENTS = 5000;

/** Postgres `in` lists get unwieldy fast; page the owned-entity lookups. */
const ID_CHUNK = 200;

export const AUDIENCE_LABELS: Record<BroadcastAudience, string> = {
  gig_applicants: "Applicants across all my gigs",
  bounty_submitters: "Submitters across all my bounties",
  my_people: "Everyone who applied to my gigs or bounties",
  all_users: "Every user on ugig.net",
};

export function isBroadcastAudience(value: unknown): value is BroadcastAudience {
  return typeof value === "string" && (BROADCAST_AUDIENCES as readonly string[]).includes(value);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Ids of gigs the user posted. */
async function ownedGigIds(svc: ServiceClient, userId: string): Promise<string[]> {
  const { data } = await svc.from("gigs").select("id").eq("poster_id", userId);
  return (data ?? []).map((row: { id: string }) => row.id);
}

/** Ids of bounties the user created. */
async function ownedBountyIds(svc: ServiceClient, userId: string): Promise<string[]> {
  const { data } = await svc.from("bounties").select("id").eq("creator_id", userId);
  return (data ?? []).map((row: { id: string }) => row.id);
}

async function gigApplicantIds(
  svc: ServiceClient,
  userId: string,
  statuses?: ApplicationStatus[]
): Promise<string[]> {
  const gigIds = await ownedGigIds(svc, userId);
  if (gigIds.length === 0) return [];

  const ids: string[] = [];
  for (const batch of chunk(gigIds, ID_CHUNK)) {
    let query = svc.from("applications").select("applicant_id").in("gig_id", batch);
    if (statuses && statuses.length > 0) {
      query = query.in("status", statuses);
    }
    const { data } = await query;
    for (const row of data ?? []) {
      if (row.applicant_id) ids.push(row.applicant_id as string);
    }
  }
  return ids;
}

async function bountySubmitterIds(svc: ServiceClient, userId: string): Promise<string[]> {
  const bountyIds = await ownedBountyIds(svc, userId);
  if (bountyIds.length === 0) return [];

  const ids: string[] = [];
  for (const batch of chunk(bountyIds, ID_CHUNK)) {
    const { data } = await svc
      .from("bounty_submissions")
      .select("submitter_id")
      .in("bounty_id", batch);
    for (const row of data ?? []) {
      if (row.submitter_id) ids.push(row.submitter_id as string);
    }
  }
  return ids;
}

/**
 * Every profile on the platform. Uses profiles rather than auth.users because
 * an in-app message needs a profile row to render a sender/recipient.
 */
async function allUserIds(svc: ServiceClient): Promise<string[]> {
  const ids: string[] = [];
  const PAGE = 1000;
  for (let page = 0; ; page++) {
    const from = page * PAGE;
    const { data, error } = await svc
      .from("profiles")
      .select("id")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const row of data) ids.push(row.id as string);
    if (data.length < PAGE) break;
  }
  return ids;
}

export interface ResolveOptions {
  audience: BroadcastAudience;
  senderId: string;
  /** Only meaningful for audiences that include gig applicants. */
  statuses?: ApplicationStatus[];
  /** Set false to count without applying MAX_BROADCAST_RECIPIENTS. */
  cap?: boolean;
}

export interface ResolvedAudience {
  /** Distinct recipient ids, sender excluded, capped. */
  recipientIds: string[];
  /** How many matched before the cap was applied. */
  totalMatched: number;
  /** True when totalMatched exceeded MAX_BROADCAST_RECIPIENTS. */
  truncated: boolean;
}

/**
 * Resolve an audience key to the distinct set of users to message.
 * The sender is always excluded — you don't broadcast to yourself.
 */
export async function resolveAudience(
  svc: ServiceClient,
  { audience, senderId, statuses, cap = true }: ResolveOptions
): Promise<ResolvedAudience> {
  let raw: string[];

  switch (audience) {
    case "gig_applicants":
      raw = await gigApplicantIds(svc, senderId, statuses);
      break;
    case "bounty_submitters":
      raw = await bountySubmitterIds(svc, senderId);
      break;
    case "my_people": {
      const [applicants, submitters] = await Promise.all([
        gigApplicantIds(svc, senderId, statuses),
        bountySubmitterIds(svc, senderId),
      ]);
      raw = [...applicants, ...submitters];
      break;
    }
    case "all_users":
      raw = await allUserIds(svc);
      break;
  }

  const distinct = Array.from(new Set(raw)).filter((id) => id && id !== senderId);
  const truncated = cap && distinct.length > MAX_BROADCAST_RECIPIENTS;

  return {
    recipientIds: truncated ? distinct.slice(0, MAX_BROADCAST_RECIPIENTS) : distinct,
    totalMatched: distinct.length,
    truncated,
  };
}

/**
 * Bulk equivalent of isEmailNotificationEnabled. One query instead of one per
 * recipient — at broadcast sizes the per-user version is the whole latency
 * budget. Missing rows mean "enabled" (opt-out model), matching the single-user
 * helper.
 */
export async function emailOptOutIds(
  svc: ServiceClient,
  userIds: string[],
  settingKey: string
): Promise<Set<string>> {
  const optedOut = new Set<string>();
  for (const batch of chunk(userIds, 500)) {
    // Dynamic column in the select defeats the typed parser; the shape is
    // { user_id, [settingKey] }.
    const { data } = await svc
      .from("notification_settings")
      .select(`user_id, ${settingKey}`)
      .in("user_id", batch);
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      if (row[settingKey] === false) optedOut.add(row.user_id as string);
    }
  }
  return optedOut;
}

export { chunk };
