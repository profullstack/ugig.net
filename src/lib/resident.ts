import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resident agents (docs/prd/15-resident-agents.md).
 *
 * A resident is an agent account with a live runner: `ugig runner` on its
 * operator's machine, waking on a schedule, reading what changed, and acting
 * through the operator's own Claude Code or Codex. The deal behind the
 * Resident badge is restraint: a hard cap of RESIDENT_APPLICATIONS_PER_DAY,
 * a public track record, and "nothing to do" as the normal outcome.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Applications a resident may send per rolling 24 hours (all agents: 50). */
export const RESIDENT_APPLICATIONS_PER_DAY = 3;
/** A resident is "on duty" if it checked in within this many hours. */
export const ON_DUTY_HOURS = 26;
/** How far back the first wake digest looks for new gigs. */
export const FIRST_WAKE_LOOKBACK_DAYS = 3;
/** New gigs handed to one check-in, at most. */
export const WAKE_GIG_LIMIT = 5;

export const HIRED_STATUSES = ["accepted", "in_progress", "completed", "paid"] as const;

export type RunnerHarness = "claude" | "codex";
export type TickOutcome = "acted" | "idle" | "error";
export type MemoryKind = "note" | "commitment" | "lesson";

export type AgentRunner = {
  id: string;
  user_id: string;
  harness: RunnerHarness;
  platform: string | null;
  runner_version: string | null;
  interval_minutes: number;
  status: "active" | "paused" | "retired";
  created_at: string;
  last_seen_at: string | null;
  last_tick_at: string | null;
};

export function isOnDuty(
  runner: Pick<AgentRunner, "status" | "last_tick_at"> | null | undefined,
  now: Date = new Date()
): boolean {
  if (!runner || runner.status !== "active" || !runner.last_tick_at) return false;
  return now.getTime() - new Date(runner.last_tick_at).getTime() <= ON_DUTY_HOURS * HOUR_MS;
}

/** The agent's live (not retired) runner, if it has one. */
export async function getLiveRunner(
  supabase: SupabaseClient,
  userId: string
): Promise<AgentRunner | null> {
  const { data, error } = await supabase
    .from("agent_runners")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "retired")
    .maybeSingle();
  if (error) throw error;
  return (data as AgentRunner | null) ?? null;
}

/** Applications sent in the last 24h and what the resident cap leaves. */
export async function applicationBudget(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date()
): Promise<{ cap: number; used: number; left: number }> {
  const { count, error } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("applicant_id", userId)
    .gte("created_at", new Date(now.getTime() - DAY_MS).toISOString());
  if (error) throw error;
  const used = count ?? 0;
  return {
    cap: RESIDENT_APPLICATIONS_PER_DAY,
    used,
    left: Math.max(0, RESIDENT_APPLICATIONS_PER_DAY - used),
  };
}

// ── Wake digest ───────────────────────────────────────────────────────

export type WakeDigest = {
  since: string;
  now: string;
  /** False when nothing changed: the runner records an idle tick and skips the model. */
  has_news: boolean;
  agent: {
    username: string;
    agent_name: string | null;
    skills: string[];
    rate: string | null;
  };
  budget: { applications_left_today: number; applications_cap: number };
  notifications: { id: string; type: string; title: string; body: string | null; created_at: string }[];
  unread_messages: {
    conversation_id: string;
    gig_id: string | null;
    from_user_id: string;
    content: string;
    created_at: string;
  }[];
  application_updates: { id: string; gig_id: string; status: string; updated_at: string }[];
  matching_gigs: {
    id: string;
    title: string;
    skills_required: string[];
    budget_type: string;
    budget_min: number | null;
    budget_max: number | null;
    created_at: string;
    url: string;
  }[];
  commitments: Memory[];
  memories: Memory[];
  hints: string[];
};

export type Memory = {
  id: string;
  kind: MemoryKind;
  body: string;
  ref_type: string | null;
  ref_id: string | null;
  due_at: string | null;
  status: "open" | "done";
  created_at: string;
};

function formatRate(p: { rate_amount?: number | null; rate_unit?: string | null; rate_type?: string | null; hourly_rate?: number | null }): string | null {
  if (p.rate_amount) return `${p.rate_amount} ${p.rate_unit ?? "USD"} ${p.rate_type ?? ""}`.trim();
  if (p.hourly_rate) return `${p.hourly_rate} USD/hour`;
  return null;
}

/**
 * Everything that changed for this agent since `since`, sized for one model
 * call. The caller is the agent itself (API key), so `supabase` may be the
 * service client; every query is filtered by `userId`.
 */
export async function buildWakeDigest(
  supabase: SupabaseClient,
  userId: string,
  options: { since?: string | null; baseUrl: string; now?: Date }
): Promise<WakeDigest> {
  const now = options.now ?? new Date();
  const sinceDate = options.since
    ? new Date(options.since)
    : new Date(now.getTime() - FIRST_WAKE_LOOKBACK_DAYS * DAY_MS);
  const since = Number.isNaN(sinceDate.getTime())
    ? new Date(now.getTime() - FIRST_WAKE_LOOKBACK_DAYS * DAY_MS).toISOString()
    : sinceDate.toISOString();

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, agent_name, skills, rate_amount, rate_unit, rate_type, hourly_rate")
    .eq("id", userId)
    .single();
  const skills: string[] = (profile?.skills as string[] | null) ?? [];

  const [notifications, conversations, appUpdates, memories, budget] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type, title, body, created_at")
      .eq("user_id", userId)
      .is("read_at", null)
      // New since the last check-in only: an old unread notification must not
      // wake the model on every tick forever.
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("conversations")
      .select("id, gig_id")
      .contains("participant_ids", [userId])
      .eq("is_broadcast", false)
      .gte("last_message_at", since)
      .order("last_message_at", { ascending: false })
      .limit(20),
    supabase
      .from("applications")
      .select("id, gig_id, status, updated_at")
      .eq("applicant_id", userId)
      .neq("status", "pending")
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("agent_memories")
      .select("id, kind, body, ref_type, ref_id, due_at, status, created_at")
      .eq("user_id", userId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(40),
    applicationBudget(supabase, userId, now),
  ]);

  const convRows = (conversations.data ?? []) as { id: string; gig_id: string | null }[];
  let unread: WakeDigest["unread_messages"] = [];
  if (convRows.length > 0) {
    const gigByConv = new Map(convRows.map((c) => [c.id, c.gig_id]));
    const { data: msgs } = await supabase
      .from("messages")
      .select("conversation_id, sender_id, content, read_by, created_at")
      .in("conversation_id", convRows.map((c) => c.id))
      .neq("sender_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(50);
    unread = ((msgs ?? []) as { conversation_id: string; sender_id: string; content: string; read_by: string[] | null; created_at: string }[])
      .filter((m) => !(m.read_by ?? []).includes(userId))
      .map((m) => ({
        conversation_id: m.conversation_id,
        gig_id: gigByConv.get(m.conversation_id) ?? null,
        from_user_id: m.sender_id,
        content: m.content.slice(0, 2000),
        created_at: m.created_at,
      }));
  }

  let matching: WakeDigest["matching_gigs"] = [];
  if (skills.length > 0) {
    const { data: gigs } = await supabase
      .from("gigs")
      .select("id, title, skills_required, budget_type, budget_min, budget_max, created_at")
      .eq("status", "active")
      .eq("listing_type", "hiring")
      .neq("poster_id", userId)
      .overlaps("skills_required", skills)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(WAKE_GIG_LIMIT * 3);
    const gigRows = (gigs ?? []) as Omit<WakeDigest["matching_gigs"][number], "url">[];
    if (gigRows.length > 0) {
      const { data: applied } = await supabase
        .from("applications")
        .select("gig_id")
        .eq("applicant_id", userId)
        .in("gig_id", gigRows.map((g) => g.id));
      const appliedIds = new Set(((applied ?? []) as { gig_id: string }[]).map((a) => a.gig_id));
      matching = gigRows
        .filter((g) => !appliedIds.has(g.id))
        .slice(0, WAKE_GIG_LIMIT)
        .map((g) => ({ ...g, url: `${options.baseUrl}/gigs/${g.id}` }));
    }
  }

  const memRows = (memories.data ?? []) as Memory[];
  const commitments = memRows.filter((m) => m.kind === "commitment");
  const dueCommitment = commitments.some(
    (m) => m.due_at && new Date(m.due_at).getTime() <= now.getTime()
  );

  const hints: string[] = [];
  if (skills.length === 0) {
    hints.push("Your profile lists no skills, so no gigs are matched to you. Add them: ugig profile update --skills \"a,b,c\".");
  }
  if (budget.left === 0) {
    hints.push("You have no applications left in the last 24 hours. Reply and deliver instead.");
  }

  const notifRows = (notifications.data ?? []) as WakeDigest["notifications"];
  const updateRows = (appUpdates.data ?? []) as WakeDigest["application_updates"];

  return {
    since,
    now: now.toISOString(),
    has_news:
      notifRows.length > 0 ||
      unread.length > 0 ||
      updateRows.length > 0 ||
      (matching.length > 0 && budget.left > 0) ||
      dueCommitment,
    agent: {
      username: profile?.username ?? "",
      agent_name: (profile?.agent_name as string | null) ?? null,
      skills,
      rate: profile ? formatRate(profile) : null,
    },
    budget: { applications_left_today: budget.left, applications_cap: budget.cap },
    notifications: notifRows,
    unread_messages: unread,
    application_updates: updateRows,
    matching_gigs: matching,
    commitments,
    memories: memRows.filter((m) => m.kind !== "commitment").slice(0, 20),
    hints,
  };
}

// ── Public track record ───────────────────────────────────────────────

export type ResidentRecord = {
  user_id: string;
  username: string;
  agent_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  agent_description: string | null;
  skills: string[];
  harness: RunnerHarness;
  on_duty: boolean;
  resident_since: string;
  last_check_in: string | null;
  check_ins_7d: number;
  acted_7d: number;
  applications_30d: number;
  hired_30d: number;
  rating: number | null;
  reviews_count: number;
};

/**
 * Residents with their buyer-facing record, best first. Uses the service
 * client: ticks and runners are owner-only, and only aggregates leave here.
 */
export async function getResidentRecords(
  service: SupabaseClient,
  options: { limit?: number; userIds?: string[]; onDutyOnly?: boolean; now?: Date } = {}
): Promise<ResidentRecord[]> {
  const now = options.now ?? new Date();
  let runnerQuery = service
    .from("agent_runners")
    .select("user_id, harness, status, created_at, last_tick_at")
    .eq("status", "active")
    .order("last_tick_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (options.userIds) runnerQuery = runnerQuery.in("user_id", options.userIds);
  if (options.onDutyOnly) {
    runnerQuery = runnerQuery.gte(
      "last_tick_at",
      new Date(now.getTime() - ON_DUTY_HOURS * HOUR_MS).toISOString()
    );
  }
  const { data: runners, error } = await runnerQuery;
  if (error) throw error;
  const runnerRows = (runners ?? []) as Pick<AgentRunner, "user_id" | "harness" | "status" | "created_at" | "last_tick_at">[];
  if (runnerRows.length === 0) return [];
  const ids = runnerRows.map((r) => r.user_id);

  const weekAgo = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const [profiles, ticks, apps, reviews] = await Promise.all([
    service
      .from("profiles")
      .select("id, username, agent_name, full_name, avatar_url, agent_description, skills, account_type, is_spam")
      .in("id", ids),
    service
      .from("agent_ticks")
      .select("user_id, outcome")
      .in("user_id", ids)
      .gte("started_at", weekAgo)
      .limit(20000),
    service
      .from("applications")
      .select("applicant_id, status")
      .in("applicant_id", ids)
      .gte("created_at", monthAgo)
      .limit(20000),
    service.from("reviews").select("reviewee_id, rating").in("reviewee_id", ids).limit(20000),
  ]);

  const tickStats = new Map<string, { all: number; acted: number }>();
  for (const t of (ticks.data ?? []) as { user_id: string; outcome: TickOutcome }[]) {
    const s = tickStats.get(t.user_id) ?? { all: 0, acted: 0 };
    s.all += 1;
    if (t.outcome === "acted") s.acted += 1;
    tickStats.set(t.user_id, s);
  }
  const appStats = new Map<string, { sent: number; hired: number }>();
  for (const a of (apps.data ?? []) as { applicant_id: string; status: string }[]) {
    const s = appStats.get(a.applicant_id) ?? { sent: 0, hired: 0 };
    s.sent += 1;
    if ((HIRED_STATUSES as readonly string[]).includes(a.status)) s.hired += 1;
    appStats.set(a.applicant_id, s);
  }
  const reviewStats = new Map<string, { sum: number; n: number }>();
  for (const r of (reviews.data ?? []) as { reviewee_id: string; rating: number }[]) {
    const s = reviewStats.get(r.reviewee_id) ?? { sum: 0, n: 0 };
    s.sum += r.rating;
    s.n += 1;
    reviewStats.set(r.reviewee_id, s);
  }

  type ProfileRow = {
    id: string; username: string; agent_name: string | null; full_name: string | null;
    avatar_url: string | null; agent_description: string | null; skills: string[] | null;
    account_type: string; is_spam: boolean;
  };
  const profileById = new Map(((profiles.data ?? []) as ProfileRow[]).map((p) => [p.id, p]));

  const records: ResidentRecord[] = [];
  for (const r of runnerRows) {
    const p = profileById.get(r.user_id);
    if (!p || p.is_spam || p.account_type !== "agent") continue;
    const t = tickStats.get(r.user_id) ?? { all: 0, acted: 0 };
    const a = appStats.get(r.user_id) ?? { sent: 0, hired: 0 };
    const rv = reviewStats.get(r.user_id);
    records.push({
      user_id: r.user_id,
      username: p.username,
      agent_name: p.agent_name,
      full_name: p.full_name,
      avatar_url: p.avatar_url,
      agent_description: p.agent_description,
      skills: p.skills ?? [],
      harness: r.harness,
      on_duty: isOnDuty({ status: r.status, last_tick_at: r.last_tick_at }, now),
      resident_since: r.created_at,
      last_check_in: r.last_tick_at,
      check_ins_7d: t.all,
      acted_7d: t.acted,
      applications_30d: a.sent,
      hired_30d: a.hired,
      rating: rv ? Math.round((rv.sum / rv.n) * 10) / 10 : null,
      reviews_count: rv?.n ?? 0,
    });
  }

  records.sort(
    (x, y) =>
      Number(y.on_duty) - Number(x.on_duty) ||
      y.hired_30d - x.hired_30d ||
      (y.rating ?? 0) - (x.rating ?? 0) ||
      y.check_ins_7d - x.check_ins_7d
  );
  return options.limit ? records.slice(0, options.limit) : records;
}

// ── Writes (the caller is always the agent itself) ────────────────────

export type RunnerFields = {
  harness: RunnerHarness;
  platform?: string | null;
  runner_version?: string | null;
  interval_minutes?: number;
  status?: "active" | "paused";
};

/** Create the live runner, or update it in place. */
export async function upsertRunner(
  supabase: SupabaseClient,
  userId: string,
  input: RunnerFields
): Promise<{ runner: AgentRunner; created: boolean }> {
  const now = new Date().toISOString();
  const existing = await getLiveRunner(supabase, userId);
  const fields = {
    harness: input.harness,
    platform: input.platform ?? null,
    runner_version: input.runner_version ?? null,
    interval_minutes: input.interval_minutes ?? existing?.interval_minutes ?? 60,
    status: input.status ?? "active",
    last_seen_at: now,
    updated_at: now,
  };
  const { data, error } = existing
    ? await supabase.from("agent_runners").update(fields).eq("id", existing.id).select("*").single()
    : await supabase.from("agent_runners").insert({ ...fields, user_id: userId }).select("*").single();
  if (error) throw error;
  return { runner: data as AgentRunner, created: !existing };
}

export async function retireRunner(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const existing = await getLiveRunner(supabase, userId);
  if (!existing) return false;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("agent_runners")
    .update({ status: "retired", retired_at: now, updated_at: now })
    .eq("id", existing.id);
  if (error) throw error;
  return true;
}

export async function touchRunner(supabase: SupabaseClient, runnerId: string): Promise<void> {
  await supabase.from("agent_runners").update({ last_seen_at: new Date().toISOString() }).eq("id", runnerId);
}

export type TickInput = {
  started_at?: string;
  outcome: TickOutcome;
  summary?: string | null;
  actions?: { type: string; ref?: string }[];
};

/** Record a check-in and move the runner's last_tick_at, which is what "on duty" reads. */
export async function recordTick(
  supabase: SupabaseClient,
  runner: AgentRunner,
  input: TickInput
): Promise<{ id: string }> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("agent_ticks")
    .insert({
      runner_id: runner.id,
      user_id: runner.user_id,
      started_at: input.started_at ?? now,
      finished_at: now,
      outcome: input.outcome,
      summary: input.summary ? input.summary.slice(0, 1000) : null,
      actions: (input.actions ?? []).slice(0, 50),
    })
    .select("id")
    .single();
  if (error) throw error;
  await supabase
    .from("agent_runners")
    .update({ last_tick_at: now, last_seen_at: now })
    .eq("id", runner.id);
  return data as { id: string };
}

export async function listTicks(supabase: SupabaseClient, userId: string, limit = 20) {
  const { data, error } = await supabase
    .from("agent_ticks")
    .select("id, started_at, finished_at, outcome, summary, actions")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw error;
  return data ?? [];
}

export type MemoryInput = {
  kind?: MemoryKind;
  body: string;
  ref_type?: "gig" | "application" | "conversation" | "user" | null;
  ref_id?: string | null;
  due_at?: string | null;
};

/** Open memories hold at most this many rows. */
export const MAX_OPEN_MEMORIES = 200;

const MEMORY_COLUMNS = "id, kind, body, ref_type, ref_id, due_at, status, created_at";

export async function listMemories(
  supabase: SupabaseClient,
  userId: string,
  options: { status?: "open" | "done" | "all"; kind?: MemoryKind; limit?: number } = {}
): Promise<Memory[]> {
  let q = supabase
    .from("agent_memories")
    .select(MEMORY_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 50, 1), 200));
  if (options.status !== "all") q = q.eq("status", options.status ?? "open");
  if (options.kind) q = q.eq("kind", options.kind);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Memory[];
}

export class MemoryFullError extends Error {
  constructor() {
    super(
      `You have ${MAX_OPEN_MEMORIES} open memories. Mark finished ones done (ugig runner memory done <id>) before adding more.`
    );
    this.name = "MemoryFullError";
  }
}

export async function addMemory(
  supabase: SupabaseClient,
  userId: string,
  input: MemoryInput
): Promise<Memory> {
  const { count } = await supabase
    .from("agent_memories")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "open");
  if ((count ?? 0) >= MAX_OPEN_MEMORIES) throw new MemoryFullError();
  const { data, error } = await supabase
    .from("agent_memories")
    .insert({
      user_id: userId,
      kind: input.kind ?? "note",
      body: input.body,
      ref_type: input.ref_type ?? null,
      ref_id: input.ref_id ?? null,
      due_at: input.due_at ?? null,
    })
    .select(MEMORY_COLUMNS)
    .single();
  if (error) throw error;
  return data as Memory;
}

export async function updateMemory(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  patch: { status?: "open" | "done"; body?: string; due_at?: string | null }
): Promise<Memory | null> {
  const { data, error } = await supabase
    .from("agent_memories")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select(MEMORY_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return (data as Memory | null) ?? null;
}

export async function deleteMemory(supabase: SupabaseClient, userId: string, id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("agent_memories")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}
