import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchGigs } from "./fetch-gigs";

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
