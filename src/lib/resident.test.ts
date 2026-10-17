import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildWakeDigest, getResidentRecords, isOnDuty, ON_DUTY_HOURS } from "./resident";

const NOW = new Date("2026-10-17T12:00:00Z");
const HOUR = 3_600_000;
const iso = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString();

type Result = { data?: unknown; count?: number | null; error?: unknown };

/** Fake keyed by table: each from(table) takes that table's next queued result. */
function fakeClient(byTable: Record<string, Result[]>) {
  const queues = Object.fromEntries(Object.entries(byTable).map(([k, v]) => [k, [...v]]));
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const client = {
    from(table: string) {
      const result = queues[table]?.shift() ?? {};
      const resolved = { data: result.data ?? null, count: result.count ?? null, error: result.error ?? null };
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "gte", "lt", "in", "is", "order", "limit", "contains", "overlaps", "update"]) {
        b[m] = vi.fn((...args: unknown[]) => {
          calls.push({ table, method: m, args });
          return b;
        });
      }
      b.single = vi.fn(() => Promise.resolve(resolved));
      b.maybeSingle = b.single;
      b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(resolved).then(resolve, reject);
      return b;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("isOnDuty", () => {
  it("is on duty within the window and off after it", () => {
    expect(isOnDuty({ status: "active", last_tick_at: iso(2 * HOUR) }, NOW)).toBe(true);
    expect(isOnDuty({ status: "active", last_tick_at: iso((ON_DUTY_HOURS + 1) * HOUR) }, NOW)).toBe(false);
  });

  it("is never on duty paused, retired, or before the first check-in", () => {
    expect(isOnDuty({ status: "paused", last_tick_at: iso(HOUR) }, NOW)).toBe(false);
    expect(isOnDuty({ status: "active", last_tick_at: null }, NOW)).toBe(false);
    expect(isOnDuty(null, NOW)).toBe(false);
  });
});

describe("getResidentRecords", () => {
  it("aggregates check-ins, applications, hires and ratings, and drops non-agents and spam", async () => {
    const { client } = fakeClient({
      agent_runners: [
        {
          data: [
            { user_id: "a", harness: "claude", status: "active", created_at: iso(10 * 24 * HOUR), last_tick_at: iso(HOUR) },
            { user_id: "b", harness: "codex", status: "active", created_at: iso(3 * 24 * HOUR), last_tick_at: iso(40 * HOUR) },
            { user_id: "spam", harness: "claude", status: "active", created_at: iso(HOUR), last_tick_at: iso(HOUR) },
          ],
        },
      ],
      profiles: [
        {
          data: [
            { id: "a", username: "alpha", agent_name: "Alpha", skills: ["rust"], account_type: "agent", is_spam: false },
            { id: "b", username: "beta", agent_name: null, skills: [], account_type: "agent", is_spam: false },
            { id: "spam", username: "spammy", skills: [], account_type: "agent", is_spam: true },
          ],
        },
      ],
      agent_ticks: [
        { data: [{ user_id: "a", outcome: "acted" }, { user_id: "a", outcome: "idle" }, { user_id: "b", outcome: "idle" }] },
      ],
      applications: [
        { data: [{ applicant_id: "a", status: "accepted" }, { applicant_id: "a", status: "pending" }, { applicant_id: "b", status: "rejected" }] },
      ],
      reviews: [{ data: [{ reviewee_id: "a", rating: 5 }, { reviewee_id: "a", rating: 4 }] }],
    });

    const records = await getResidentRecords(client, { now: NOW });
    expect(records.map((r) => r.username)).toEqual(["alpha", "beta"]);
    expect(records[0]).toMatchObject({
      on_duty: true,
      check_ins_7d: 2,
      acted_7d: 1,
      applications_30d: 2,
      hired_30d: 1,
      rating: 4.5,
      reviews_count: 2,
    });
    expect(records[1]).toMatchObject({ on_duty: false, rating: null, hired_30d: 0 });
  });

  it("returns nothing without runners, without querying further", async () => {
    const { client, calls } = fakeClient({ agent_runners: [{ data: [] }] });
    expect(await getResidentRecords(client, { now: NOW })).toEqual([]);
    expect(calls.every((c) => c.table === "agent_runners")).toBe(true);
  });
});

describe("buildWakeDigest", () => {
  const profile = { username: "alpha", agent_name: "Alpha", skills: ["rust"], rate_amount: 40, rate_unit: "USD", rate_type: "hourly" };

  it("has no news when nothing changed, so the runner skips the model", async () => {
    const { client } = fakeClient({
      profiles: [{ data: profile }],
      notifications: [{ data: [] }],
      conversations: [{ data: [] }],
      applications: [{ data: [] }, { count: 0 }],
      agent_memories: [{ data: [] }],
      gigs: [{ data: [] }],
    });
    const d = await buildWakeDigest(client, "a", { since: iso(HOUR), baseUrl: "https://ugig.net", now: NOW });
    expect(d.has_news).toBe(false);
    expect(d.budget).toEqual({ applications_left_today: 3, applications_cap: 3 });
    expect(d.agent.rate).toBe("40 USD hourly");
  });

  it("wakes for a matching gig the agent has not applied to, with its URL", async () => {
    const gig = { id: "g1", title: "Rust parser", skills_required: ["rust"], budget_type: "fixed", budget_min: 100, budget_max: 300, created_at: iso(HOUR / 2) };
    const { client, calls } = fakeClient({
      profiles: [{ data: profile }],
      notifications: [{ data: [] }],
      conversations: [{ data: [] }],
      applications: [{ data: [] }, { count: 1 }, { data: [] }],
      agent_memories: [{ data: [] }],
      gigs: [{ data: [gig] }],
    });
    const d = await buildWakeDigest(client, "a", { since: iso(HOUR), baseUrl: "https://ugig.net", now: NOW });
    expect(d.has_news).toBe(true);
    expect(d.matching_gigs).toEqual([{ ...gig, url: "https://ugig.net/gigs/g1" }]);
    expect(d.budget.applications_left_today).toBe(2);
    expect(calls.some((c) => c.table === "gigs" && c.method === "overlaps")).toBe(true);
  });

  it("does not wake for gigs once the budget is spent, and says so", async () => {
    const gig = { id: "g1", title: "Rust parser", skills_required: ["rust"], budget_type: "fixed", budget_min: null, budget_max: null, created_at: iso(HOUR / 2) };
    const { client } = fakeClient({
      profiles: [{ data: profile }],
      notifications: [{ data: [] }],
      conversations: [{ data: [] }],
      applications: [{ data: [] }, { count: 3 }, { data: [] }],
      agent_memories: [{ data: [] }],
      gigs: [{ data: [gig] }],
    });
    const d = await buildWakeDigest(client, "a", { since: iso(HOUR), baseUrl: "https://ugig.net", now: NOW });
    expect(d.has_news).toBe(false);
    expect(d.hints.join(" ")).toMatch(/no applications left/);
  });

  it("wakes for a commitment that has fallen due", async () => {
    const { client } = fakeClient({
      profiles: [{ data: { ...profile, skills: [] } }],
      notifications: [{ data: [] }],
      conversations: [{ data: [] }],
      applications: [{ data: [] }, { count: 0 }],
      agent_memories: [
        { data: [{ id: "m1", kind: "commitment", body: "Send draft", due_at: iso(HOUR), status: "open", created_at: iso(48 * HOUR) }] },
      ],
    });
    const d = await buildWakeDigest(client, "a", { since: iso(HOUR / 2), baseUrl: "https://ugig.net", now: NOW });
    expect(d.has_news).toBe(true);
    expect(d.commitments).toHaveLength(1);
    expect(d.hints.join(" ")).toMatch(/no skills/);
  });
});
