import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeSupabase } from "./fake-supabase.test-helper";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("@/lib/coinpay-oauth", () => ({ getCoinpayLink: vi.fn() }));

import { handleGigOrderPaypalPayment } from "./escrow-webhook";
import { autoReleasePaypalOrders } from "./paypal-auto-release";
import { pickPayoutWallet, paypalBuyNowEnabled, releasePaypalOrder } from "./buy-now";
import { sendEmail } from "@/lib/email";

const order = {
  id: "o1", gig_id: "g1", buyer_id: "buyer", seller_id: "seller", status: "pending_payment",
  amount_usd: 50, platform_fee_usd: 2.5, payment_rail: "paypal", paypal_transaction_id: "ptx_1",
};

describe("PayPal Buy now", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ORDER_ALERT_EMAIL = "ops@example.com";
  });
  afterEach(() => {
    delete process.env.UGIG_PAYPAL_BUY_NOW;
  });

  it("is off unless explicitly enabled", () => {
    expect(paypalBuyNowEnabled()).toBe(false);
    process.env.UGIG_PAYPAL_BUY_NOW = "true";
    expect(paypalBuyNowEnabled()).toBe(true);
  });

  it("pays sellers in a stablecoin when they have one", () => {
    const w = (currency: string) => ({ currency, cryptocurrency: currency, label: null, address: currency }) as any;
    expect(pickPayoutWallet([w("sol"), w("usdc_pol"), w("btc")]).currency).toBe("usdc_pol");
    expect(pickPayoutWallet([w("sol"), w("btc")]).currency).toBe("sol");
  });

  it("marks the order paid when CoinPay confirms the PayPal capture", async () => {
    const db = fakeSupabase({ gig_orders: [order], notifications: [] });
    const handled = await handleGigOrderPaypalPayment(db.client, { type: "payment.confirmed", data: { payment_id: "ptx_1" } });
    expect(handled).toBe(true);
    expect(db.updates.gig_orders[0]).toMatchObject({ status: "funded" });
  });

  it("ignores payments that are not orders", async () => {
    const db = fakeSupabase({ gig_orders: [order] });
    expect(await handleGigOrderPaypalPayment(db.client, { type: "payment.confirmed", data: { payment_id: "other" } })).toBe(false);
  });

  it("release records the seller payout as owed and alerts ops", async () => {
    const db = fakeSupabase({ gig_orders: [{ ...order, status: "delivered" }], notifications: [] });
    expect(await releasePaypalOrder(db.client, order, "buyer")).toBe(true);
    expect(db.updates.gig_orders[0]).toMatchObject({ status: "released", payout_status: "owed" });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "ops@example.com", subject: expect.stringMatching(/payout owed: \$47.5/) }));
  });

  it("auto-releases paid PayPal orders after 14 days, not before", async () => {
    const now = new Date("2026-11-01T00:00:00Z");
    const db = fakeSupabase({
      gig_orders: [
        { ...order, id: "old", status: "funded", funded_at: "2026-10-10T00:00:00Z", created_at: "2026-10-10T00:00:00Z" },
        { ...order, id: "new", status: "funded", funded_at: "2026-10-25T00:00:00Z", created_at: "2026-10-25T00:00:00Z" },
      ],
      notifications: [],
    });
    const result = await autoReleasePaypalOrders(db.client, now);
    expect(result.due).toBe(1);
    expect(result.released).toBe(1);
  });
});
