import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  attachSellerTrust,
  fetchSellerTrust,
  fetchVerifiedPosterIds,
  MIN_ON_TIME_SAMPLE,
  sellerTrustLabel,
  toSellerTrust,
} from "./seller-trust";

const A = "00000000-0000-4000-a000-00000000000a";
const B = "00000000-0000-4000-a000-00000000000b";

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  user_id: A,
  delivered_count: 0,
  on_time_measured: 0,
  on_time_count: 0,
  paid_count: 0,
  ...over,
});

function rpcClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { supabase: { rpc } as unknown as SupabaseClient, rpc };
}

describe("toSellerTrust", () => {
  it("zero history is a new seller, never a made-up rate", () => {
    const t = toSellerTrust(row());
    expect(t).toMatchObject({ new_seller: true, delivered_count: 0, on_time_rate: null, verified_poster: false });
    expect(sellerTrustLabel(t)).toBe("New seller");
  });

  it("shows delivered without a rate until enough deadlines are measured", () => {
    const t = toSellerTrust(row({ delivered_count: 14, on_time_measured: MIN_ON_TIME_SAMPLE - 1, on_time_count: 2 }));
    expect(t.on_time_rate).toBeNull();
    expect(sellerTrustLabel(t)).toBe("14 delivered");
  });

  it("rounds the on-time rate once the sample is big enough", () => {
    const t = toSellerTrust(row({ delivered_count: 14, on_time_measured: 12, on_time_count: 11 }));
    expect(t.on_time_rate).toBe(92);
    expect(sellerTrustLabel(t)).toBe("14 delivered · 92% on time");
  });

  it("verified poster = has paid for a job, or manually verified", () => {
    expect(toSellerTrust(row({ paid_count: 1 })).verified_poster).toBe(true);
    expect(toSellerTrust(row(), true).verified_poster).toBe(true);
    expect(toSellerTrust(row()).verified_poster).toBe(false);
  });
});

describe("fetchSellerTrust", () => {
  it("asks once for the distinct ids", async () => {
    const { supabase, rpc } = rpcClient({ data: [row({ delivered_count: 3 })], error: null });
    const map = await fetchSellerTrust(supabase, [A, A, null, undefined]);
    expect(rpc).toHaveBeenCalledWith("seller_trust_stats", { user_ids: [A] });
    expect(map.get(A)?.delivered_count).toBe(3);
  });

  it("an error means unknown (empty map), not new", async () => {
    const { supabase } = rpcClient({ data: null, error: { message: "boom" } });
    expect((await fetchSellerTrust(supabase, [A])).size).toBe(0);
  });

  it("does not call the database for no ids", async () => {
    const { supabase, rpc } = rpcClient({ data: [], error: null });
    await fetchSellerTrust(supabase, []);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("attachSellerTrust", () => {
  it("puts trust on each gig's poster and leaves unknown posters alone", async () => {
    const { supabase } = rpcClient({ data: [row({ user_id: A, delivered_count: 2 })], error: null });
    const gigs: Record<string, unknown>[] = [
      { id: "g1", poster_id: A, poster: { id: A, username: "a" } },
      { id: "g2", poster_id: B, poster: [{ id: B, username: "b" }] },
      { id: "g3", poster_id: A },
    ];
    await attachSellerTrust(supabase, gigs);
    expect((gigs[0].poster as any).trust.delivered_count).toBe(2);
    expect((gigs[1].poster as any)[0].trust).toBeUndefined();
    expect(gigs[2].poster).toBeUndefined();
  });

  it("passes the poster's manual verification through", async () => {
    const { supabase } = rpcClient({ data: [row({ user_id: A })], error: null });
    const gigs: Record<string, unknown>[] = [{ poster: { id: A, verified: true } }];
    await attachSellerTrust(supabase, gigs);
    expect((gigs[0].poster as any).trust.verified_poster).toBe(true);
  });
});

describe("fetchVerifiedPosterIds", () => {
  it("accepts both SETOF row shapes PostgREST returns", async () => {
    const { supabase } = rpcClient({ data: [A, { verified_poster_ids: B }], error: null });
    expect(await fetchVerifiedPosterIds(supabase)).toEqual([A, B]);
  });

  it("is empty on error, which only loses the ordering", async () => {
    const { supabase } = rpcClient({ data: null, error: { message: "nope" } });
    expect(await fetchVerifiedPosterIds(supabase)).toEqual([]);
  });
});
