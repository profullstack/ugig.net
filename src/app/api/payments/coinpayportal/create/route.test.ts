import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
  requireFullAccess: vi.fn(() => null),
}));

vi.mock("@/lib/coinpayportal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/coinpayportal")>()),
  createPayment: vi.fn(),
  createPaypalPayment: vi.fn(),
  createCheckoutSession: vi.fn(async () => null),
  getSupportedCoins: vi.fn(async () => ({
    success: true,
    coins: [
      { symbol: "USDC_POL", name: "USD Coin (Polygon)", is_active: true, has_wallet: true },
      { symbol: "DOGE", name: "Dogecoin", is_active: true, has_wallet: true },
      { symbol: "BTC", name: "Bitcoin", is_active: true, has_wallet: true },
    ],
  })),
}));

import { POST } from "./route";
import { getAuthContext, requireFullAccess } from "@/lib/auth/get-user";
import {
  createCheckoutSession,
  createPayment,
  createPaypalPayment,
} from "@/lib/coinpayportal";
import { resetCheckoutCoinsCache } from "@/lib/payments/pro-checkout";
import { createFakeSupabase } from "@/test/fake-supabase";

const USER_ID = "666cbaba-c6ea-4756-ad44-d6a5b4248f8f";
const GIG_ID = "8489a861-0999-4107-afca-2592021ac338";

function req(body?: unknown) {
  return { json: () => Promise.resolve(body) } as any;
}

describe("POST /api/payments/coinpayportal/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCheckoutCoinsCache();
    process.env.UGIG_PAYPAL_BUY_NOW = "true";
  });

  it("returns 401 if not authenticated", async () => {
    (getAuthContext as any).mockResolvedValue(null);

    const res = await POST(req({ type: "subscription", currency: "btc" }));

    expect(res.status).toBe(401);
  });

  it("rejects restricted public API keys", async () => {
    (getAuthContext as any).mockResolvedValue({
      user: { id: USER_ID, authMethod: "api_key", scope: "public" },
      supabase: {},
    });
    (requireFullAccess as any).mockReturnValueOnce(
      Response.json({ error: "full access required" }, { status: 403 }) as any
    );

    const res = await POST(req({ type: "subscription", currency: "btc" }));

    expect(res.status).toBe(403);
  });

  it("rejects direct gig payments so gigs go through invoices", async () => {
    (getAuthContext as any).mockResolvedValue({
      user: { id: USER_ID, authMethod: "api_key", scope: "full" },
      supabase: {},
    });

    const res = await POST(
      req({
        type: "gig_payment",
        currency: "btc",
        amount_usd: 2,
        gig_id: GIG_ID,
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Gig payments must be paid through invoices");
    expect(createPayment).not.toHaveBeenCalled();
  });

  describe("subscription prices and plan metadata", () => {
    function setup(sub: Record<string, unknown> | null = null) {
      const db = createFakeSupabase({
        subscriptions: sub ? [{ user_id: USER_ID, ...sub }] : [],
        payments: [],
        profiles: [{ id: USER_ID, username: "buyer1" }],
      });
      (getAuthContext as any).mockResolvedValue({
        user: { id: USER_ID, authMethod: "session", email: "buyer@example.com" },
        supabase: db,
      });
      (createPayment as any).mockResolvedValue({
        payment_id: "cp-new",
        checkout_url: "https://pay.example/cp-new",
        expires_at: "2026-10-07T00:00:00Z",
      });
      return db;
    }

    it.each([
      ["monthly", 9],
      ["annual", 90],
      ["lifetime", 100],
    ])("%s charges $%d and stores the plan on the local row", async (plan, price) => {
      const db = setup();
      const res = await POST(req({ type: "subscription", plan, currency: "usdc_pol" }));
      expect(res.status).toBe(200);
      expect((createPayment as any).mock.calls[0][0]).toMatchObject({
        amount_usd: price,
        metadata: {
          property: "ugig.net",
          user_id: USER_ID,
          username: "buyer1",
          email: "buyer@example.com",
          type: "subscription",
          plan,
          ugig_payment_id: db.tables.payments[0].id,
        },
      });
      expect(db.tables.payments[0]).toMatchObject({
        amount_usd: price,
        status: "pending",
        metadata: { plan, expires_at: "2026-10-07T00:00:00Z" },
      });
    });

    it("defaults a subscription without a plan to monthly", async () => {
      const db = setup();
      await POST(req({ type: "subscription", currency: "usdc_pol" }));
      expect(db.tables.payments[0]).toMatchObject({ amount_usd: 9, metadata: { plan: "monthly" } });
    });

    it("refuses any subscription purchase from a Lifetime member", async () => {
      setup({ plan: "lifetime", status: "active" });
      const res = await POST(req({ type: "subscription", plan: "annual", currency: "usdc_pol" }));
      expect(res.status).toBe(400);
      expect(createPayment).not.toHaveBeenCalled();
    });

    it("refuses crypto Pro while a card (Stripe) Pro subscription is active, but allows Lifetime", async () => {
      setup({ plan: "pro", status: "active", stripe_subscription_id: "sub_123" });
      const annual = await POST(req({ type: "subscription", plan: "annual", currency: "usdc_pol" }));
      expect(annual.status).toBe(400);
      const lifetime = await POST(req({ type: "subscription", plan: "lifetime", currency: "usdc_pol" }));
      expect(lifetime.status).toBe(200);
    });

    it("tips do not carry a plan", async () => {
      const db = setup();
      await POST(req({ type: "tip", amount_usd: 5, currency: "usdc_pol" }));
      expect(db.tables.payments[0].metadata.plan).toBeUndefined();
    });

    it("accepts any coin CoinPay lists for the business, not a fixed set", async () => {
      const db = setup();
      const res = await POST(req({ type: "subscription", plan: "monthly", currency: "DOGE" }));
      expect(res.status).toBe(200);
      expect((createPayment as any).mock.calls[0][0]).toMatchObject({ currency: "doge" });
      expect(db.tables.payments[0]).toMatchObject({ currency: "doge", coinpay_payment_id: "cp-new" });
      expect((createPayment as any).mock.calls[0][0].idempotency_key).toBe(db.tables.payments[0].id);
    });

    it("falls back to CoinPay's hosted pay page when create returns no checkout_url", async () => {
      setup();
      (createPayment as any).mockResolvedValueOnce({ payment_id: "cp-xyz", address: "0xabc", amount_crypto: 9.01 });
      const res = await POST(req({ type: "subscription", plan: "monthly", currency: "usdc_pol" }));
      expect((await res.json()).checkout_url).toBe("https://coinpayportal.com/pay/cp-xyz");
    });

    it("hides a coin CoinPay refuses at creation and says so", async () => {
      setup();
      (createPayment as any).mockRejectedValueOnce(
        new Error("CoinPay create failed 400: Unsupported blockchain for fee estimation: BASE")
      );
      const first = await POST(req({ type: "subscription", plan: "monthly", currency: "doge" }));
      expect(first.status).toBe(502);
      expect((await first.json()).error).toMatch(/Pick another coin/);
      const again = await POST(req({ type: "subscription", plan: "monthly", currency: "doge" }));
      expect(again.status).toBe(400);
    });

    it("rejects a coin CoinPay does not accept", async () => {
      setup();
      const res = await POST(req({ type: "subscription", plan: "monthly", currency: "ltc" }));
      expect(res.status).toBe(400);
      expect(createPayment).not.toHaveBeenCalled();
    });

    it("pays by PayPal or card through CoinPay with the buyer's email", async () => {
      const db = setup();
      (createPaypalPayment as any).mockResolvedValue({
        transaction_id: "pp-txn-1",
        approve_url: "https://paypal.example/approve",
        checkout_url: "https://coinpayportal.com/pay/paypal/pp-txn-1",
      });
      const res = await POST(req({ type: "subscription", plan: "lifetime", method: "paypal" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ rail: "paypal", checkout_url: "https://coinpayportal.com/pay/paypal/pp-txn-1" });
      expect((createPaypalPayment as any).mock.calls[0][0]).toMatchObject({
        amount_usd: 100,
        customer_email: "buyer@example.com",
        metadata: { property: "ugig.net", user_id: USER_ID, plan: "lifetime", rail: "paypal" },
      });
      expect(createPayment).not.toHaveBeenCalled();
      expect(db.tables.payments[0]).toMatchObject({
        coinpay_payment_id: "pp-txn-1",
        currency: "paypal",
        metadata: { plan: "lifetime", rail: "paypal" },
      });
    });

    it("refuses PayPal when the PayPal rail is off", async () => {
      setup();
      process.env.UGIG_PAYPAL_BUY_NOW = "false";
      const res = await POST(req({ type: "subscription", plan: "monthly", method: "paypal" }));
      expect(res.status).toBe(400);
      expect(createPaypalPayment).not.toHaveBeenCalled();
    });

    it("prefers a CoinPay hosted checkout session when CoinPay serves one", async () => {
      const db = setup();
      (createCheckoutSession as any).mockResolvedValueOnce({ id: "cs_1", url: "https://coinpayportal.com/checkout/cs_1" });
      const res = await POST(req({ type: "subscription", plan: "annual", currency: "usdc_pol" }));
      const body = await res.json();
      expect(body).toMatchObject({ rail: "hosted", checkout_url: "https://coinpayportal.com/checkout/cs_1" });
      expect((createCheckoutSession as any).mock.calls[0][0]).toMatchObject({
        amount_usd: 90,
        customer_email: "buyer@example.com",
        account_id: USER_ID,
        property: "ugig.net",
        metadata: { user_id: USER_ID, plan: "annual", ugig_payment_id: db.tables.payments[0].id },
      });
      expect(createPayment).not.toHaveBeenCalled();
      expect(db.tables.payments[0]).toMatchObject({
        coinpay_payment_id: null,
        currency: "hosted",
        metadata: { checkout_session_id: "cs_1", plan: "annual" },
      });
    });
  });
});
