import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeSupabase } from "@/lib/orders/fake-supabase.test-helper";

const state = vi.hoisted(() => ({ db: null as any, user: { id: "admin" } }));
vi.mock("@/lib/auth/get-user", () => ({ getAuthContext: vi.fn(async () => ({ user: state.user })) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => state.db.client }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ success: true }) }));

import { POST } from "./route";

const order = {
  id: "o1", gig_id: "g1", buyer_id: "buyer", seller_id: "seller", status: "released",
  amount_usd: 50, platform_fee_usd: 2.5, payment_rail: "paypal", payout_status: "owed",
};
const req = (body: unknown) => ({ json: async () => body }) as any;
const params = { params: Promise.resolve({ id: "o1" }) };

describe("admin PayPal payout actions", () => {
  beforeEach(() => {
    state.user = { id: "admin" };
    state.db = fakeSupabase({
      profiles: [{ id: "admin", is_admin: true }, { id: "seller", is_admin: false }],
      gig_orders: [order],
      notifications: [],
    });
  });

  it("an admin marks an owed payout paid", async () => {
    const res = await POST(req({ action: "paid", tx_hash: "5abcdef123456" }), params);
    expect(res.status).toBe(200);
    expect(state.db.updates.gig_orders[0]).toMatchObject({ payout_status: "paid", payout_tx_hash: "5abcdef123456" });
  });

  it("a non-admin gets a 404", async () => {
    state.user = { id: "seller" };
    expect((await POST(req({ action: "paid", tx_hash: "5abcdef123456" }), params)).status).toBe(404);
  });

  it("refuses crypto orders", async () => {
    state.db = fakeSupabase({ profiles: [{ id: "admin", is_admin: true }], gig_orders: [{ ...order, payment_rail: "crypto" }] });
    expect((await POST(req({ action: "refunded" }), params)).status).toBe(400);
  });
});
