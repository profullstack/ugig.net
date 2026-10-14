import { describe, it, expect } from "vitest";
import { fakeSupabase } from "./fake-supabase.test-helper";
import { escrowIdFromWebhook, handleGigOrderEscrowEvent } from "./escrow-webhook";

const order = {
  id: "o1", gig_id: "g1", buyer_id: "buyer", seller_id: "seller", status: "pending_payment",
  amount_usd: 50, platform_fee_usd: 2.5, coinpay_escrow_id: "esc_1",
};

describe("handleGigOrderEscrowEvent", () => {
  it("reads CoinPay's escrow_id", () => {
    expect(escrowIdFromWebhook({ type: "escrow.funded", data: { escrow_id: "esc_1" } })).toBe("esc_1");
  });

  it("marks an order funded and tells both sides", async () => {
    const db = fakeSupabase({ gig_orders: [order], notifications: [] });
    const handled = await handleGigOrderEscrowEvent(db.client, { type: "escrow.funded", data: { escrow_id: "esc_1" } });
    expect(handled).toBe(true);
    expect(db.updates.gig_orders[0]).toMatchObject({ status: "funded" });
    expect(db.inserts.notifications.map((n: any) => n.user_id).sort()).toEqual(["buyer", "seller"]);
  });

  it("treats an auto-release at expiry as released", async () => {
    const db = fakeSupabase({ gig_orders: [{ ...order, status: "funded" }], notifications: [] });
    await handleGigOrderEscrowEvent(db.client, { type: "escrow.released", data: { escrow_id: "esc_1" } });
    expect(db.updates.gig_orders[0]).toMatchObject({ status: "released" });
  });

  it("leaves events for other escrows to the gig_escrows handlers", async () => {
    const db = fakeSupabase({ gig_orders: [order] });
    const handled = await handleGigOrderEscrowEvent(db.client, { type: "escrow.funded", data: { escrow_id: "esc_other" } });
    expect(handled).toBe(false);
  });
});
