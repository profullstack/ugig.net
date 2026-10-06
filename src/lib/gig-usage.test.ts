import { describe, it, expect } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { getGigPostAllowance, recordGigPost } from "./gig-usage";
import { FREE_MONTHLY_GIG_POSTS } from "@/lib/plans";

const NOW = new Date(2026, 9, 6, 12, 0, 0); // October 2026, local time
const USER = "user-1";

/** increment_gig_usage as deployed before migration 20261006131000: UPDATE only. */
function legacyIncrement(db: FakeSupabase) {
  db.rpcs.increment_gig_usage = ({ p_user_id, p_month, p_year }) => {
    for (const row of db.tables.gig_usage) {
      if (row.user_id === p_user_id && row.month === p_month && row.year === p_year) {
        row.posts_count += 1;
      }
    }
  };
}

/** increment_gig_usage after migration 20261006131000: INSERT ... ON CONFLICT. */
function atomicIncrement(db: FakeSupabase) {
  db.rpcs.increment_gig_usage = ({ p_user_id, p_month, p_year }) => {
    const row = db.tables.gig_usage.find(
      (r) => r.user_id === p_user_id && r.month === p_month && r.year === p_year
    );
    if (row) row.posts_count += 1;
    else db.tables.gig_usage.push({ user_id: p_user_id, month: p_month, year: p_year, posts_count: 1 });
  };
}

function usage(db: FakeSupabase) {
  return db.tables.gig_usage.find((r) => r.user_id === USER)?.posts_count;
}

describe("recordGigPost", () => {
  it("counts every post (the old upsert reset the counter to 2 each time)", async () => {
    const db = createFakeSupabase({ gig_usage: [] });
    legacyIncrement(db);
    for (let i = 0; i < 5; i++) await recordGigPost(db as any, USER, NOW);
    expect(usage(db)).toBe(5);
  });

  it("works after the migration, when RLS refuses the user's upsert", async () => {
    const db = createFakeSupabase({ gig_usage: [] });
    atomicIncrement(db);
    db.failWrites.gig_usage = { code: "42501", message: "new row violates row-level security policy" };
    for (let i = 0; i < 3; i++) await recordGigPost(db as any, USER, NOW);
    expect(usage(db)).toBe(3);
  });

  it("counts against the current calendar month", async () => {
    const db = createFakeSupabase({ gig_usage: [] });
    legacyIncrement(db);
    await recordGigPost(db as any, USER, NOW);
    expect(db.tables.gig_usage[0]).toMatchObject({ month: 10, year: 2026, posts_count: 1 });
  });
});

describe("getGigPostAllowance", () => {
  it("blocks a free account at the monthly cap and allows it below", async () => {
    const db = createFakeSupabase({
      subscriptions: [{ user_id: USER, plan: "free", status: "active" }],
      gig_usage: [{ user_id: USER, month: 10, year: 2026, posts_count: FREE_MONTHLY_GIG_POSTS - 1 }],
    });
    legacyIncrement(db);

    const before = await getGigPostAllowance(db as any, USER, NOW);
    expect(before).toMatchObject({ allowed: true, remaining: 1 });

    await recordGigPost(db as any, USER, NOW);
    const after = await getGigPostAllowance(db as any, USER, NOW);
    expect(after).toMatchObject({ allowed: false, used: FREE_MONTHLY_GIG_POSTS, remaining: 0 });
  });

  it("treats a user with no subscription row as free", async () => {
    const db = createFakeSupabase({
      subscriptions: [],
      gig_usage: [{ user_id: USER, month: 10, year: 2026, posts_count: FREE_MONTHLY_GIG_POSTS }],
    });
    expect((await getGigPostAllowance(db as any, USER, NOW)).allowed).toBe(false);
  });

  it("a new month starts at zero", async () => {
    const db = createFakeSupabase({
      gig_usage: [{ user_id: USER, month: 9, year: 2026, posts_count: 50 }],
    });
    expect(await getGigPostAllowance(db as any, USER, NOW)).toMatchObject({ allowed: true, used: 0 });
  });

  it.each([
    ["pro", "active"],
    ["pro", "trialing"],
    ["lifetime", "active"],
    ["lifetime", "canceled"],
  ])("is unlimited for %s (%s)", async (plan, status) => {
    const db = createFakeSupabase({
      subscriptions: [{ user_id: USER, plan, status }],
      gig_usage: [{ user_id: USER, month: 10, year: 2026, posts_count: 999 }],
    });
    expect(await getGigPostAllowance(db as any, USER, NOW)).toEqual({ allowed: true, unlimited: true });
  });

  it("a canceled pro plan falls back to the free cap", async () => {
    const db = createFakeSupabase({
      subscriptions: [{ user_id: USER, plan: "pro", status: "canceled" }],
      gig_usage: [{ user_id: USER, month: 10, year: 2026, posts_count: FREE_MONTHLY_GIG_POSTS }],
    });
    expect((await getGigPostAllowance(db as any, USER, NOW)).allowed).toBe(false);
  });
});
