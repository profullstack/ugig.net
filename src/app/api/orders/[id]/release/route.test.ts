import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeSupabase } from "@/lib/orders/fake-supabase.test-helper";

const state = vi.hoisted(() => ({ db: null as any, user: { id: "buyer" } }));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(async () => ({ user: state.user, supabase: state.db.client })),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => state.db.client }));
vi.mock("@/lib/coinpayportal", () => ({ releaseEscrow: vi.fn().mockResolvedValue({}) }));

import { POST as release } from "./route";
import { POST as deliver } from "../deliver/route";
import { releaseEscrow } from "@/lib/coinpayportal";

const order = {
  id: "o1", gig_id: "g1", buyer_id: "buyer", seller_id: "seller", status: "delivered",
  amount_usd: 50, platform_fee_usd: 2.5, coinpay_escrow_id: "esc_1", coinpay_release_token: "esc_secret",
};
const params = { params: Promise.resolve({ id: "o1" }) };
const req = (body: unknown = {}) => ({ json: async () => body }) as any;

describe("order release and delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.user = { id: "buyer" };
    state.db = fakeSupabase({ gig_orders: [order], notifications: [] });
  });

  it("the buyer releases with the stored release token", async () => {
    const res = await release(req(), params);
    expect(res.status).toBe(200);
    expect(releaseEscrow).toHaveBeenCalledWith("esc_1", "esc_secret");
    expect(state.db.updates.gig_orders[0]).toMatchObject({ status: "released" });
  });

  it("the seller cannot release", async () => {
    state.user = { id: "seller" };
    const res = await release(req(), params);
    expect(res.status).toBe(403);
    expect(releaseEscrow).not.toHaveBeenCalled();
  });

  it("a stranger sees no order", async () => {
    state.user = { id: "stranger" };
    expect((await release(req(), params)).status).toBe(404);
  });

  it("an unpaid order cannot be released", async () => {
    state.db = fakeSupabase({ gig_orders: [{ ...order, status: "pending_payment" }] });
    const res = await release(req(), params);
    expect(res.status).toBe(409);
    expect(releaseEscrow).not.toHaveBeenCalled();
  });

  it("the seller marks a funded order delivered", async () => {
    state.user = { id: "seller" };
    state.db = fakeSupabase({ gig_orders: [{ ...order, status: "funded" }], notifications: [] });
    const res = await deliver(req({ note: "Done, see repo" }), params);
    expect(res.status).toBe(200);
    expect(state.db.updates.gig_orders[0]).toMatchObject({ status: "delivered", delivery_note: "Done, see repo" });
  });

  it("the buyer cannot mark delivered", async () => {
    state.db = fakeSupabase({ gig_orders: [{ ...order, status: "funded" }] });
    expect((await deliver(req(), params)).status).toBe(403);
  });
});
