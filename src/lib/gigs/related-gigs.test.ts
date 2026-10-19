import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchRelatedGigs, RELATED_LIMIT } from "./related-gigs";

function client(data: unknown[] | null, error: unknown = null) {
  const chain: Record<string, any> = {};
  for (const m of ["select", "eq", "neq", "gte", "not", "order"]) chain[m] = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue({ data, error });
  return { supabase: { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient, chain };
}

describe("fetchRelatedGigs", () => {
  it("asks for active listings of the same type and category, least-viewed first, not this one", async () => {
    const { supabase, chain } = client([{ id: "g2", title: "Two", poster: { username: "bo" } }]);
    const out = await fetchRelatedGigs(supabase, { id: "g1", category: "Writing", listingType: "for_hire" });
    expect(chain.eq).toHaveBeenCalledWith("status", "active");
    expect(chain.eq).toHaveBeenCalledWith("listing_type", "for_hire");
    expect(chain.eq).toHaveBeenCalledWith("category", "Writing");
    expect(chain.neq).toHaveBeenCalledWith("id", "g1");
    expect(chain.order).toHaveBeenNthCalledWith(1, "views_count", { ascending: true, nullsFirst: true });
    expect(chain.limit).toHaveBeenCalledWith(RELATED_LIMIT);
    expect(out).toEqual([{ id: "g2", title: "Two", poster_username: "bo" }]);
  });

  it("hides blocked posters", async () => {
    const { supabase, chain } = client([]);
    await fetchRelatedGigs(supabase, { id: "g1", category: "Writing", listingType: "hiring" }, ["u1"]);
    expect(chain.not).toHaveBeenCalledWith("poster_id", "in", "(u1)");
  });

  it("returns nothing on error or with no category", async () => {
    expect(await fetchRelatedGigs(client(null, { message: "x" }).supabase, { id: "g", category: "C", listingType: "hiring" })).toEqual([]);
    expect(await fetchRelatedGigs(client([]).supabase, { id: "g", category: null, listingType: "hiring" })).toEqual([]);
  });
});
