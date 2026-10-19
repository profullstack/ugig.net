import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchGigs } from "./fetch-gigs";
import { NOT_MICRO_BUDGET_FILTER } from "./micro-budget";

const BLOCKED_A = "00000000-0000-4000-a000-00000000000a";
const BLOCKED_B = "00000000-0000-4000-a000-00000000000b";

/**
 * A chainable query mock: every builder method returns the same chain, and the
 * chain resolves to `result` whether it is awaited directly (the head/count
 * queries) or after `.range()` (the row queries).
 */
function chainMock(result: { data: unknown[]; count: number }) {
  const chain: Record<string, unknown> = {};
  for (const m of [
    "select",
    "eq",
    "not",
    "or",
    "gte",
    "lt",
    "overlaps",
    "order",
    "range",
    "in",
  ]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

function clientWith(result: { data: unknown[]; count: number }) {
  const chain = chainMock(result);
  const from = vi.fn().mockReturnValue(chain);
  return {
    supabase: { from } as unknown as SupabaseClient,
    chain,
    not: chain.not as ReturnType<typeof vi.fn>,
  };
}

const baseOptions = {
  listingType: "hiring" as const,
  filters: { tags: [] as string[] },
  // "oldest" skips the boost-pinning branch, so exactly one query is built
  sort: "oldest",
  page: 1,
  limit: 20,
};

describe("fetchGigs block filtering", () => {
  it("excludes gigs posted by a blocked user", async () => {
    const { supabase, not } = clientWith({ data: [], count: 0 });

    await fetchGigs(supabase, {
      ...baseOptions,
      excludeUserIds: [BLOCKED_A, BLOCKED_B],
    });

    expect(not).toHaveBeenCalledWith(
      "poster_id",
      "in",
      `(${BLOCKED_A},${BLOCKED_B})`
    );
  });

  it("applies no exclusion filter when the viewer has blocked nobody", async () => {
    const { supabase, not } = clientWith({ data: [], count: 0 });

    await fetchGigs(supabase, { ...baseOptions, excludeUserIds: [] });

    expect(not).not.toHaveBeenCalled();
  });

  it("applies no exclusion filter for a logged-out viewer", async () => {
    const { supabase, not } = clientWith({ data: [], count: 0 });

    // A page that never resolved a viewer passes no list at all.
    await fetchGigs(supabase, baseOptions);

    expect(not).not.toHaveBeenCalled();
  });

  it("filters the boosted and count queries too, so pagination matches", async () => {
    const { supabase, not } = clientWith({ data: [], count: 0 });

    // The default (newest) sort builds several queries: the boosted count, the
    // boosted slice, and the non-boosted remainder. Every one must be filtered
    // or the page count would include gigs the viewer never sees.
    await fetchGigs(supabase, {
      ...baseOptions,
      sort: "newest",
      excludeUserIds: [BLOCKED_A],
    });

    const filtered = not.mock.calls.filter(
      ([column, op, value]) =>
        column === "poster_id" && op === "in" && value === `(${BLOCKED_A})`
    );
    expect(filtered.length).toBeGreaterThanOrEqual(2);
  });
});

describe("fetchGigs status filter", () => {
  it("lists only active gigs, so a gig paused by expiry drops out of /gigs and /for-hire", async () => {
    const { supabase, chain } = clientWith({ data: [], count: 0 });
    await fetchGigs(supabase, baseOptions);
    expect(chain.eq as ReturnType<typeof vi.fn>).toHaveBeenCalledWith("status", "active");
  });
});

describe("fetchGigs micro-budget filter", () => {
  it("leaves sub-$5 gigs out and reports how many it hid", async () => {
    // The mock answers every query with count 7; the unfiltered count query
    // shares it, so hiddenMicro is 0 here. What matters is the filter call.
    const { supabase, chain } = clientWith({ data: [], count: 7 });
    const result = await fetchGigs(supabase, { ...baseOptions, hideMicroBudgets: true });
    expect(chain.or as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(NOT_MICRO_BUDGET_FILTER);
    expect(result.hiddenMicro).toBe(0);
  });

  it("filters every query of the default sort, so pages and counts agree", async () => {
    const { supabase, chain } = clientWith({ data: [], count: 0 });
    await fetchGigs(supabase, { ...baseOptions, sort: "newest", hideMicroBudgets: true });
    const microCalls = (chain.or as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([f]) => f === NOT_MICRO_BUDGET_FILTER
    );
    expect(microCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("does not filter when not asked to (for-hire, include_micro)", async () => {
    const { supabase, chain } = clientWith({ data: [], count: 3 });
    const result = await fetchGigs(supabase, baseOptions);
    expect(chain.or as ReturnType<typeof vi.fn>).not.toHaveBeenCalledWith(NOT_MICRO_BUDGET_FILTER);
    expect(result.hiddenMicro).toBe(0);
  });
});

const VERIFIED = "00000000-0000-4000-a000-0000000000f1";

/**
 * A fake that knows which tier each query is for: boosted (gte boosted_at),
 * verified (in poster_id) or the rest (not poster_id in). Head queries get the
 * tier's count; row queries get `range`-sliced rows labelled with the tier.
 */
function tieredClient(counts: { boosted: number; verified: number; rest: number }) {
  const ranges: { tier: string; from: number; to: number }[] = [];
  const from = vi.fn().mockImplementation(() => {
    let tier = "rest";
    let head = false;
    let slice: [number, number] | null = null;
    const chain: Record<string, unknown> = {};
    for (const m of ["eq", "or", "overlaps", "order", "lt"]) chain[m] = vi.fn().mockReturnValue(chain);
    chain.select = vi.fn().mockImplementation((_s: string, o?: { head?: boolean }) => {
      head = !!o?.head;
      return chain;
    });
    chain.gte = vi.fn().mockImplementation(() => ((tier = "boosted"), chain));
    chain.in = vi.fn().mockImplementation(() => ((tier = "verified"), chain));
    chain.not = vi.fn().mockReturnValue(chain);
    chain.range = vi.fn().mockImplementation((a: number, b: number) => {
      slice = [a, b];
      ranges.push({ tier, from: a, to: b });
      return chain;
    });
    chain.then = (resolve: (v: unknown) => void) => {
      const count = counts[tier as keyof typeof counts];
      if (head || !slice) return resolve({ data: null, count });
      const [a, b] = slice;
      const n = Math.max(0, Math.min(b, count - 1) - a + 1);
      resolve({ data: Array.from({ length: n }, (_, i) => ({ id: `${tier}-${a + i}`, tier })), count });
    };
    return chain;
  });
  return { supabase: { from } as unknown as SupabaseClient, ranges };
}

describe("fetchGigs verified-poster tier", () => {
  it("lists boosts, then verified posters, then the rest", async () => {
    const { supabase } = tieredClient({ boosted: 1, verified: 2, rest: 30 });
    const result = await fetchGigs(supabase, {
      ...baseOptions,
      sort: "newest",
      limit: 5,
      verifiedPosterIds: [VERIFIED],
    });
    expect(result.gigs.map((g) => g.id)).toEqual([
      "boosted-0",
      "verified-0",
      "verified-1",
      "rest-0",
      "rest-1",
    ]);
    expect(result.count).toBe(33);
  });

  it("pages across the tier boundary without skipping or repeating", async () => {
    const { supabase } = tieredClient({ boosted: 0, verified: 3, rest: 30 });
    const result = await fetchGigs(supabase, {
      ...baseOptions,
      sort: "newest",
      page: 2,
      limit: 2,
      verifiedPosterIds: [VERIFIED],
    });
    expect(result.gigs.map((g) => g.id)).toEqual(["verified-2", "rest-0"]);
  });

  it("verifiedOnly with no verified posters returns nothing without querying", async () => {
    const { supabase } = tieredClient({ boosted: 0, verified: 0, rest: 9 });
    const result = await fetchGigs(supabase, {
      ...baseOptions,
      sort: "newest",
      verifiedOnly: true,
      verifiedPosterIds: [],
    });
    expect(result).toEqual({ gigs: [], count: 0, hiddenMicro: 0 });
  });

  it("keeps the plain boosted-then-newest order when no ids are given", async () => {
    const { supabase } = tieredClient({ boosted: 1, verified: 0, rest: 5 });
    const result = await fetchGigs(supabase, { ...baseOptions, sort: "newest", limit: 3 });
    expect(result.gigs.map((g) => g.id)).toEqual(["boosted-0", "rest-0", "rest-1"]);
  });
});
