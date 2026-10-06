import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
  requireFullAccess: vi.fn(() => null),
}));

vi.mock("@/lib/coinpayportal", () => ({
  createPayment: vi.fn(),
}));

import { POST } from "./route";
import { getAuthContext, requireFullAccess } from "@/lib/auth/get-user";
import { createPayment } from "@/lib/coinpayportal";
import { createFakeSupabase } from "@/test/fake-supabase";

const USER_ID = "666cbaba-c6ea-4756-ad44-d6a5b4248f8f";
const GIG_ID = "8489a861-0999-4107-afca-2592021ac338";

function req(body?: unknown) {
  return { json: () => Promise.resolve(body) } as any;
}

describe("POST /api/payments/coinpayportal/create", () => {
  beforeEach(() => vi.clearAllMocks());

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
      });
      (getAuthContext as any).mockResolvedValue({
        user: { id: USER_ID, authMethod: "session" },
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
        metadata: { user_id: USER_ID, type: "subscription", plan },
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
  });
});
