import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  APPLICATIONS_PER_DAY,
  COVER_LETTER_DUPLICATE_WINDOW,
  FOR_HIRE_AD_EXPIRY_DAYS,
  FOR_HIRE_ADS_MAX_ACTIVE,
  FOR_HIRE_ADS_PER_DAY,
  FOR_HIRE_DUPLICATE_TITLE_WINDOW,
  HELD_SPAM_REVIEW,
  HIRING_GIG_EXPIRY_DAYS,
  NEW_AGENT_AGE_DAYS,
  NEW_AGENT_APPLICATIONS_PER_DAY,
  checkApplicationLimits,
  checkForHireAdActivation,
  checkForHireAdRate,
  computeExpiresAt,
  dailyApplicationCap,
  expiryDaysFor,
  heldMetadata,
  isGigExpired,
  limitResponse,
  normalizeCoverLetter,
  normalizeTitle,
  retryAfterFromOldest,
} from "./limits";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-06T12:00:00.000Z");
const USER = "user-1";

type Result = { data?: unknown; count?: number | null; error?: unknown };
type Call = { table: string; calls: [string, unknown[]][] };

/**
 * A PostgREST-ish fake: each from() takes the next queued result, records
 * every chained call, and resolves on await or .single().
 */
function fakeClient(results: Result[]) {
  const queue = [...results];
  const log: Call[] = [];
  const client = {
    from(table: string) {
      const entry: Call = { table, calls: [] };
      log.push(entry);
      const result = queue.shift() ?? {};
      const resolved = { data: result.data ?? null, count: result.count ?? null, error: result.error ?? null };
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "gte", "lt", "in", "is", "order", "limit"]) {
        b[m] = vi.fn((...args: unknown[]) => {
          entry.calls.push([m, args]);
          return b;
        });
      }
      b.single = vi.fn(() => Promise.resolve(resolved));
      b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(resolved).then(resolve, reject);
      return b;
    },
  };
  return { client: client as unknown as SupabaseClient, log };
}

function hasCall(entry: Call, method: string, ...args: unknown[]) {
  return entry.calls.some(([m, a]) => m === method && JSON.stringify(a) === JSON.stringify(args));
}

// ── Constants (the decided values) ────────────────────────────────────

describe("limit constants", () => {
  it("match the decided values", () => {
    expect(HIRING_GIG_EXPIRY_DAYS).toBe(30);
    expect(FOR_HIRE_AD_EXPIRY_DAYS).toBe(60);
    expect(FOR_HIRE_ADS_PER_DAY).toBe(10);
    expect(FOR_HIRE_ADS_MAX_ACTIVE).toBe(50);
    expect(FOR_HIRE_DUPLICATE_TITLE_WINDOW).toBe(50);
    expect(APPLICATIONS_PER_DAY).toBe(50);
    expect(NEW_AGENT_APPLICATIONS_PER_DAY).toBe(20);
    expect(NEW_AGENT_AGE_DAYS).toBe(7);
    expect(COVER_LETTER_DUPLICATE_WINDOW).toBe(20);
    expect(HELD_SPAM_REVIEW).toBe("spam_review");
  });
});

// ── Expiry helpers ────────────────────────────────────────────────────

describe("expiry helpers", () => {
  it("gives hiring gigs 30 days and for_hire ads 60", () => {
    expect(expiryDaysFor("hiring")).toBe(30);
    expect(expiryDaysFor(null)).toBe(30);
    expect(expiryDaysFor("for_hire")).toBe(60);
    expect(computeExpiresAt("hiring", NOW)).toBe(new Date(NOW.getTime() + 30 * DAY).toISOString());
    expect(computeExpiresAt("for_hire", NOW)).toBe(new Date(NOW.getTime() + 60 * DAY).toISOString());
  });

  it("treats only a paused gig past its date as expired", () => {
    const past = new Date(NOW.getTime() - 1000).toISOString();
    const future = new Date(NOW.getTime() + 1000).toISOString();
    expect(isGigExpired({ status: "paused", expires_at: past }, NOW)).toBe(true);
    expect(isGigExpired({ status: "paused", expires_at: NOW.toISOString() }, NOW)).toBe(true);
    expect(isGigExpired({ status: "paused", expires_at: future }, NOW)).toBe(false);
    expect(isGigExpired({ status: "paused", expires_at: null }, NOW)).toBe(false);
    expect(isGigExpired({ status: "active", expires_at: past }, NOW)).toBe(false);
    expect(isGigExpired({ status: "closed", expires_at: past }, NOW)).toBe(false);
  });
});

// ── Normalization ─────────────────────────────────────────────────────

describe("normalizeTitle", () => {
  it("ignores case, digits and punctuation", () => {
    expect(normalizeTitle("a00017 CLI, $5.99 USDC (UNIQUE)")).toBe(normalizeTitle("A00018 cli $6.99 usdc unique"));
    expect(normalizeTitle("Logo Design!!!")).toBe("logo design");
  });

  it("keeps different words different", () => {
    expect(normalizeTitle("Logo design")).not.toBe(normalizeTitle("Web design"));
  });

  it("collapses to empty for a title of digits and symbols only", () => {
    expect(normalizeTitle("123 $$$ 456")).toBe("");
  });
});

describe("normalizeCoverLetter", () => {
  it("ignores whitespace and case only", () => {
    expect(normalizeCoverLetter("  Hello\n\nWorld  ")).toBe(normalizeCoverLetter("hello world"));
    expect(normalizeCoverLetter("Hello, world")).not.toBe(normalizeCoverLetter("Hello world"));
  });
});

describe("retryAfterFromOldest", () => {
  it("is the seconds until the oldest event leaves the window", () => {
    const oldest = new Date(NOW.getTime() - DAY + 90_000).toISOString();
    expect(retryAfterFromOldest(oldest, DAY, NOW)).toBe(90);
  });

  it("is at least 1 and undefined with no event", () => {
    const old = new Date(NOW.getTime() - 2 * DAY).toISOString();
    expect(retryAfterFromOldest(old, DAY, NOW)).toBe(1);
    expect(retryAfterFromOldest(null, DAY, NOW)).toBeUndefined();
  });
});

describe("limitResponse", () => {
  it("sets the status, message and Retry-After", async () => {
    const res = limitResponse({ ok: false, status: 429, error: "slow down", retryAfterSeconds: 42 });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(await res.json()).toEqual({ error: "slow down", retry_after: 42 });
  });

  it("omits Retry-After when unknown", () => {
    const res = limitResponse({ ok: false, status: 409, error: "dup" });
    expect(res.status).toBe(409);
    expect(res.headers.get("Retry-After")).toBeNull();
  });
});

// ── For-hire ad rate ──────────────────────────────────────────────────

describe("checkForHireAdRate", () => {
  it("allows the 10th ad in 24h (9 already)", async () => {
    const { client, log } = fakeClient([{ count: FOR_HIRE_ADS_PER_DAY - 1, data: [] }]);
    expect(await checkForHireAdRate(client, USER, NOW)).toEqual({ ok: true });
    const q = log[0];
    expect(q.table).toBe("gigs");
    expect(hasCall(q, "eq", "poster_id", USER)).toBe(true);
    expect(hasCall(q, "eq", "listing_type", "for_hire")).toBe(true);
    expect(hasCall(q, "gte", "created_at", new Date(NOW.getTime() - DAY).toISOString())).toBe(true);
  });

  it("refuses the 11th ad in 24h with 429 and Retry-After", async () => {
    const oldest = new Date(NOW.getTime() - DAY + 3600_000).toISOString();
    const { client } = fakeClient([{ count: FOR_HIRE_ADS_PER_DAY, data: [{ created_at: oldest }] }]);
    const r = await checkForHireAdRate(client, USER, NOW);
    expect(r).toMatchObject({ ok: false, status: 429, retryAfterSeconds: 3600 });
    if (!r.ok) expect(r.error).toContain("10 for-hire ads in 24 hours");
  });

  it("throws on a query error rather than letting the post through silently", async () => {
    const { client } = fakeClient([{ error: { message: "boom" } }]);
    await expect(checkForHireAdRate(client, USER, NOW)).rejects.toBeTruthy();
  });
});

// ── For-hire ad activation ────────────────────────────────────────────

describe("checkForHireAdActivation", () => {
  it("allows the 50th active ad (49 already) with a fresh title", async () => {
    const { client, log } = fakeClient([
      { count: FOR_HIRE_ADS_MAX_ACTIVE - 1 },
      { data: [{ id: "a", title: "Logo design" }] },
    ]);
    expect(await checkForHireAdActivation(client, USER, "Web scraping in Python")).toEqual({ ok: true });
    expect(hasCall(log[0], "eq", "status", "active")).toBe(true);
    expect(hasCall(log[1], "limit", FOR_HIRE_DUPLICATE_TITLE_WINDOW)).toBe(true);
  });

  it("refuses a 51st active ad with 429", async () => {
    const { client } = fakeClient([{ count: FOR_HIRE_ADS_MAX_ACTIVE }]);
    const r = await checkForHireAdActivation(client, USER, "Anything");
    expect(r).toMatchObject({ ok: false, status: 429 });
    if (!r.ok) expect(r.error).toContain("50 active for-hire ads");
  });

  it("refuses a near-duplicate title with 409", async () => {
    const { client } = fakeClient([
      { count: 3 },
      { data: [{ id: "a", title: "a00017 CLI, $5.99 USDC (UNIQUE)" }] },
    ]);
    const r = await checkForHireAdActivation(client, USER, "A00449 cli $5.99 usdc unique");
    expect(r).toMatchObject({ ok: false, status: 409 });
  });

  it("excludes the ad itself when re-activating it", async () => {
    const { client, log } = fakeClient([{ count: 0 }, { data: [] }]);
    await checkForHireAdActivation(client, USER, "Logo design", "gig-9");
    expect(hasCall(log[0], "neq", "id", "gig-9")).toBe(true);
    expect(hasCall(log[1], "neq", "id", "gig-9")).toBe(true);
  });
});

// ── Applications ──────────────────────────────────────────────────────

describe("dailyApplicationCap", () => {
  it("is 50 for humans and established agents, 20 for agents under 7 days", () => {
    const sixDays = new Date(NOW.getTime() - 6 * DAY).toISOString();
    const justUnder = new Date(NOW.getTime() - 7 * DAY + 1000).toISOString();
    const sevenDays = new Date(NOW.getTime() - 7 * DAY).toISOString();
    expect(dailyApplicationCap({ account_type: "human", created_at: sixDays }, NOW)).toBe(50);
    expect(dailyApplicationCap({ account_type: "agent", created_at: sixDays }, NOW)).toBe(20);
    expect(dailyApplicationCap({ account_type: "agent", created_at: justUnder }, NOW)).toBe(20);
    expect(dailyApplicationCap({ account_type: "agent", created_at: sevenDays }, NOW)).toBe(50);
    expect(dailyApplicationCap(null, NOW)).toBe(50);
  });
});

const LETTER = "I have built three CLI tools in Rust and would like to help with this one.";
const OLD_HUMAN = { account_type: "human", created_at: "2025-01-01T00:00:00Z", is_spam: false };
const NEW_AGENT = { account_type: "agent", created_at: new Date(NOW.getTime() - 2 * DAY).toISOString(), is_spam: false };

describe("checkApplicationLimits", () => {
  it("allows the 50th application in 24h for a human (49 sent)", async () => {
    const { client, log } = fakeClient([
      { data: OLD_HUMAN },
      { count: APPLICATIONS_PER_DAY - 1, data: [] },
      { data: [] },
    ]);
    expect(await checkApplicationLimits(client, USER, LETTER, { now: NOW })).toEqual({ ok: true, held: false });
    expect(log[1].table).toBe("applications");
    expect(hasCall(log[1], "eq", "applicant_id", USER)).toBe(true);
    expect(hasCall(log[2], "limit", COVER_LETTER_DUPLICATE_WINDOW)).toBe(true);
  });

  it("refuses the 51st application in 24h for a human with 429 + Retry-After", async () => {
    const oldest = new Date(NOW.getTime() - DAY + 600_000).toISOString();
    const { client } = fakeClient([
      { data: OLD_HUMAN },
      { count: APPLICATIONS_PER_DAY, data: [{ created_at: oldest }] },
    ]);
    const r = await checkApplicationLimits(client, USER, LETTER, { now: NOW });
    expect(r).toMatchObject({ ok: false, status: 429, retryAfterSeconds: 600 });
  });

  it("allows a new agent its 20th application and refuses the 21st", async () => {
    const ok = fakeClient([{ data: NEW_AGENT }, { count: 19, data: [] }, { data: [] }]);
    expect(await checkApplicationLimits(ok.client, USER, LETTER, { now: NOW })).toEqual({ ok: true, held: false });

    const over = fakeClient([{ data: NEW_AGENT }, { count: 20, data: [{ created_at: NOW.toISOString() }] }]);
    const r = await checkApplicationLimits(over.client, USER, LETTER, { now: NOW });
    expect(r).toMatchObject({ ok: false, status: 429 });
    if (!r.ok) expect(r.error).toContain("New agent accounts");
  });

  it("refuses a cover letter identical after whitespace/case normalization with 409", async () => {
    const { client } = fakeClient([
      { data: OLD_HUMAN },
      { count: 3, data: [] },
      { data: [{ id: "x", cover_letter: `  ${LETTER.toUpperCase()}\n` }] },
    ]);
    const r = await checkApplicationLimits(client, USER, LETTER, { now: NOW });
    expect(r).toMatchObject({ ok: false, status: 409 });
    if (!r.ok) expect(r.error).toMatch(/tailor/i);
  });

  it("allows a letter that differs by more than whitespace/case", async () => {
    const { client } = fakeClient([
      { data: OLD_HUMAN },
      { count: 3, data: [] },
      { data: [{ id: "x", cover_letter: LETTER.replace("Rust", "Go") }] },
    ]);
    expect(await checkApplicationLimits(client, USER, LETTER, { now: NOW })).toEqual({ ok: true, held: false });
  });

  it("excludes the withdrawn application being resubmitted from the duplicate check", async () => {
    const { client, log } = fakeClient([{ data: OLD_HUMAN }, { count: 0, data: [] }, { data: [] }]);
    await checkApplicationLimits(client, USER, LETTER, { now: NOW, excludeApplicationId: "app-1" });
    expect(hasCall(log[2], "neq", "id", "app-1")).toBe(true);
  });

  it("lets a spam-flagged applicant through as held", async () => {
    const { client } = fakeClient([
      { data: { ...OLD_HUMAN, is_spam: true } },
      { count: 0, data: [] },
      { data: [] },
    ]);
    expect(await checkApplicationLimits(client, USER, LETTER, { now: NOW })).toEqual({ ok: true, held: true });
  });

  it("still caps a spam-flagged applicant", async () => {
    const { client } = fakeClient([
      { data: { ...OLD_HUMAN, is_spam: true } },
      { count: 50, data: [{ created_at: NOW.toISOString() }] },
    ]);
    expect(await checkApplicationLimits(client, USER, LETTER, { now: NOW })).toMatchObject({ ok: false, status: 429 });
  });

  it("uses the standard cap when the profile is missing", async () => {
    const { client } = fakeClient([{ data: null, error: { message: "no rows" } }, { count: 49, data: [] }, { data: [] }]);
    expect(await checkApplicationLimits(client, USER, LETTER, { now: NOW })).toEqual({ ok: true, held: false });
  });
});

describe("heldMetadata", () => {
  it("marks held applications for spam review", () => {
    expect(heldMetadata(true)).toEqual({ held: "spam_review" });
    expect(heldMetadata(false)).toBeUndefined();
  });
});

// ── The migration agrees with this module ─────────────────────────────

describe("20261006134000 migration", () => {
  async function sql() {
    const fs = await import("node:fs");
    const path = await import("node:path");
    return fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/20261006134000_gig_expiry_and_held_applications.sql"),
      "utf8"
    );
  }

  it("uses the same expiry windows as the app", async () => {
    const text = await sql();
    expect(text).toContain(`INTERVAL '${FOR_HIRE_AD_EXPIRY_DAYS} days'`);
    expect(text).toContain(`INTERVAL '${HIRING_GIG_EXPIRY_DAYS} days'`);
    // Backfill floor: nothing expires within two weeks of shipping.
    expect(text).toMatch(/GREATEST\(\s*now\(\) \+ INTERVAL '14 days'/);
  });

  it("holds spam applications with the same marker and skips them in the notify trigger", async () => {
    const text = await sql();
    expect(text).toContain(`jsonb_build_object('held', '${HELD_SPAM_REVIEW}')`);
    const notify = text.slice(text.indexOf("FUNCTION public.notify_on_new_application"));
    expect(notify).toMatch(/IF NEW\.metadata ->> 'held' IS NOT NULL THEN\s+RETURN NEW;/);
  });
});
