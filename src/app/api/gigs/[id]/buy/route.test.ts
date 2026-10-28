import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeSupabase } from "@/lib/orders/fake-supabase.test-helper";

const state = vi.hoisted(() => ({ db: null as any, user: { id: "buyer" } as { id: string } | null }));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(async () => (state.user ? { user: state.user, supabase: state.db.client } : null)),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => state.db.client }));
vi.mock("@/lib/coinpay-oauth", () => ({ getCoinpayLink: vi.fn() }));
vi.mock("@/lib/coinpayportal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/coinpayportal")>();
  return { ...actual, createEscrow: vi.fn(), createPaypalPayment: vi.fn(), readCoinpayUserinfoWallets: vi.fn() };
});

import { GET, POST } from "./route";
import { getCoinpayLink } from "@/lib/coinpay-oauth";
import { createEscrow, createPaypalPayment, readCoinpayUserinfoWallets } from "@/lib/coinpayportal";

const SELLER_SOL = "FX8QhU1TPUiTeVfkpRhzDvPFYvCwfPZxbHLnwNBoS3Ui";
const BUYER_SOL = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

const gig = {
  id: "g1", title: "Landing page", poster_id: "seller", listing_type: "for_hire",
  status: "active", budget_type: "fixed", budget_min: 50, budget_max: null, payment_coin: "USDC",
};

function req(body?: unknown) {
  return { json: async () => body } as any;
}
const params = { params: Promise.resolve({ id: "g1" }) };
const sellerWallets = () => [
  { currency: "sol", cryptocurrency: "SOL", label: null, address: SELLER_SOL, network: null },
  { currency: "usdt_pol", cryptocurrency: "USDT_POL", label: null, address: "0xabc", network: null },
];

describe("/api/gigs/[id]/buy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.user = { id: "buyer" };
    state.db = fakeSupabase({ gigs: [gig], gig_orders: [] });
    // The seller's link carries the wallets saved at connect time (no token).
    vi.mocked(getCoinpayLink).mockResolvedValue({ state: "connected", wallets: sellerWallets() } as any);
    vi.mocked(createEscrow).mockResolvedValue({
      id: "esc_1", escrow_address: "EscrowAddr1111", amount: 0.33, expires_at: "2026-10-28T00:00:00Z",
      release_token: "esc_secret",
    } as any);
  });

  it("GET offers only coins the seller can receive through escrow", async () => {
    const res = await GET(req(), params);
    const body = await res.json();
    expect(body.buyable).toBe(true);
    expect(body.amount_usd).toBe(50);
    expect(body.fee_percent).toBe(5);
    expect(body.currencies.map((c: any) => c.value)).toEqual(["sol"]);
  });

  it("GET tells the owner Buy now is on when their CoinPay wallet is usable", async () => {
    state.user = { id: "seller" };
    const body = await (await GET(req(), params)).json();
    expect(body).toMatchObject({ buyable: false, owner: true, seller_ready: true, fee_percent: 5 });
  });

  it("GET tells the owner to connect CoinPay when they haven't", async () => {
    state.user = { id: "seller" };
    vi.mocked(getCoinpayLink).mockResolvedValue({ state: "none", wallets: null } as any);
    const body = await (await GET(req(), params)).json();
    expect(body).toMatchObject({ owner: true, seller_ready: false, fix: "not_connected" });
    expect(body.reason).toMatch(/Add a payout wallet/);
  });

  it("GET tells the owner of an hourly listing why Buy now is off", async () => {
    state.user = { id: "seller" };
    state.db = fakeSupabase({ gigs: [{ ...gig, budget_type: "hourly" }] });
    const body = await (await GET(req(), params)).json();
    expect(body).toMatchObject({ owner: true, seller_ready: false });
    expect(body.reason).toMatch(/fixed-price/);
    expect(body.fix).toBeUndefined();
  });

  // 2026-10-28: a seller's link lapsed and Buy now vanished with no word to anyone.
  it("GET tells a buyer payments are unavailable when the seller must reconnect", async () => {
    vi.mocked(getCoinpayLink).mockResolvedValue({ state: "needs_reconnect", wallets: null } as any);
    const body = await (await GET(req(), params)).json();
    expect(body).toMatchObject({ buyable: false, payments_unavailable: true, seller_fix: "needs_reconnect" });
    expect(body.reason).toMatch(/seller must reconnect/);
  });

  it("GET says CoinPay is briefly down, not 'reconnect', when a refresh could not reach it", async () => {
    vi.mocked(getCoinpayLink).mockResolvedValue({ state: "needs_reconnect", wallets: null, temporary: true } as any);
    const body = await (await GET(req(), params)).json();
    expect(body).toMatchObject({ buyable: false, payments_unavailable: true, seller_fix: "unavailable" });
    expect(body.reason).not.toMatch(/reconnect/);
  });

  it("GET never calls CoinPay for the seller's wallets (they are stored, not fetched with a token)", async () => {
    const body = await (await GET(req(), params)).json();
    expect(body.buyable).toBe(true);
    expect(readCoinpayUserinfoWallets).not.toHaveBeenCalled();
  });

  it("POST escrows the price to the seller with ugig's 5% marketplace fee and stores the token", async () => {
    const res = await POST(req({ currency: "sol", refund_address: BUYER_SOL, requirements: "Make it pop" }), params);
    expect(res.status).toBe(201);
    expect(createEscrow).toHaveBeenCalledWith(expect.objectContaining({
      amount_usd: 50,
      currency: "sol",
      depositor_address: BUYER_SOL,
      beneficiary_address: SELLER_SOL,
      marketplace_fee_percent: 5,
      allow_auto_release: true,
      expires_in_hours: 336,
    }));
    const row = state.db.inserts.gig_orders[0];
    expect(row).toMatchObject({
      buyer_id: "buyer", seller_id: "seller", amount_usd: 50, platform_fee_usd: 2.5,
      coinpay_escrow_id: "esc_1", coinpay_release_token: "esc_secret", escrow_address: "EscrowAddr1111",
    });
    expect(JSON.stringify(await res.json())).not.toContain("esc_secret");
  });

  it("POST refuses when the seller has no CoinPay link", async () => {
    vi.mocked(getCoinpayLink).mockResolvedValue({ state: "none", wallets: null } as any);
    const res = await POST(req({ currency: "sol", refund_address: BUYER_SOL }), params);
    expect(res.status).toBe(409);
    expect(createEscrow).not.toHaveBeenCalled();
  });

  it("GET tells an agent owner the exact API call that turns Buy now on", async () => {
    state.user = { id: "seller" };
    vi.mocked(getCoinpayLink).mockResolvedValue({ state: "none", wallets: null } as any);
    const body = await (await GET(req(), params)).json();
    expect(body.reason).toContain("PUT /api/profile/wallet-addresses");
    expect(body.api_fix).toMatchObject({ method: "PUT", path: "/api/profile/wallet-addresses" });
    expect(body.api_fix.currencies).toContain("usdc_sol");
    expect(body.api_fix.currencies).not.toContain("usdt_pol");
  });

  describe("seller with no CoinPay link but a profile payout wallet", () => {
    beforeEach(() => {
      vi.mocked(getCoinpayLink).mockResolvedValue({ state: "none", wallets: null } as any);
      state.db = fakeSupabase({
        gigs: [gig],
        gig_orders: [],
        profiles: [{
          id: "seller",
          wallet_addresses: [
            { currency: "sol", address: SELLER_SOL, is_preferred: true },
            { currency: "usdt_pol", address: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28" },
            { currency: "usdc", address: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28" },
          ],
        }],
      });
    });

    it("GET is buyable in the escrow coins the profile holds", async () => {
      const body = await (await GET(req(), params)).json();
      expect(body.buyable).toBe(true);
      expect(body.currencies.map((c: any) => c.value)).toEqual(["sol"]);
    });

    it("GET tells the owner Buy now is on from their profile wallet", async () => {
      state.user = { id: "seller" };
      const body = await (await GET(req(), params)).json();
      expect(body).toMatchObject({ owner: true, seller_ready: true, payout_source: "profile", currencies: ["sol"] });
    });

    it("POST escrows to the profile wallet with the 5% fee and stores the release token", async () => {
      const res = await POST(req({ currency: "sol", refund_address: BUYER_SOL }), params);
      expect(res.status).toBe(201);
      expect(createEscrow).toHaveBeenCalledWith(expect.objectContaining({
        beneficiary_address: SELLER_SOL,
        marketplace_fee_percent: 5,
      }));
      expect(state.db.inserts.gig_orders[0]).toMatchObject({
        seller_payout_address: SELLER_SOL, coinpay_release_token: "esc_secret",
      });
      expect(JSON.stringify(await res.json())).not.toContain("esc_secret");
    });

    it("POST never pays an address the buyer supplies", async () => {
      const res = await POST(req({
        currency: "sol", refund_address: BUYER_SOL,
        beneficiary_address: BUYER_SOL, seller_payout_address: BUYER_SOL, marketplace_fee_address: BUYER_SOL,
      }), params);
      expect(res.status).toBe(201);
      const call = vi.mocked(createEscrow).mock.calls[0][0] as any;
      expect(call.beneficiary_address).toBe(SELLER_SOL);
      expect(call.marketplace_fee_address).toBeUndefined();
    });
  });

  it("POST refuses a coin the seller cannot receive", async () => {
    const res = await POST(req({ currency: "eth", refund_address: "0x1111111111111111111111111111111111111111" }), params);
    expect(res.status).toBe(400);
    expect(createEscrow).not.toHaveBeenCalled();
  });

  it("POST refuses a malformed refund address", async () => {
    const res = await POST(req({ currency: "sol", refund_address: "not-a-solana-address" }), params);
    expect(res.status).toBe(400);
  });

  it("POST refuses the seller buying their own listing", async () => {
    state.user = { id: "seller" };
    const res = await POST(req({ currency: "sol", refund_address: BUYER_SOL }), params);
    expect(res.status).toBe(400);
    expect(createEscrow).not.toHaveBeenCalled();
  });

  it("POST with PayPal is refused while PayPal is off", async () => {
    const res = await POST(req({ method: "paypal" }), params);
    expect(res.status).toBe(400);
    expect(createPaypalPayment).not.toHaveBeenCalled();
  });

  it("POST with PayPal opens a checkout on ugig's business and sends the buyer to the card-or-PayPal page", async () => {
    process.env.UGIG_PAYPAL_BUY_NOW = "true";
    vi.mocked(createPaypalPayment).mockResolvedValue({
      transaction_id: "ptx_1",
      approve_url: "https://paypal.test/approve",
      checkout_url: "https://coinpay.test/pay/paypal/ptx_1",
    });
    try {
      const res = await POST({ json: async () => ({ method: "paypal" }), nextUrl: { origin: "https://ugig.net" } } as any, params);
      expect(res.status).toBe(201);
      const body = await res.json();
      // The hosted page offers "Debit or Credit Card"; PayPal's own redirect is login-only.
      expect(body.approve_url).toBe("https://coinpay.test/pay/paypal/ptx_1");
      expect(body.paypal_approve_url).toBe("https://paypal.test/approve");
      expect(createPaypalPayment).toHaveBeenCalledWith(expect.objectContaining({ amount_usd: 50 }));
      expect(state.db.inserts.gig_orders[0]).toMatchObject({
        payment_rail: "paypal", currency: "paypal", seller_payout_address: SELLER_SOL, payout_currency: "sol",
      });
      expect(state.db.inserts.gig_orders[0].buyer_refund_address).toBeUndefined();
      expect(state.db.updates.gig_orders[0]).toMatchObject({ paypal_transaction_id: "ptx_1" });
    } finally {
      delete process.env.UGIG_PAYPAL_BUY_NOW;
    }
  });

  it("POST requires sign-in", async () => {
    state.user = null;
    const res = await POST(req({ currency: "sol", refund_address: BUYER_SOL }), params);
    expect(res.status).toBe(401);
  });

  it("POST sends a second click to the existing unpaid order", async () => {
    state.db = fakeSupabase({
      gigs: [gig],
      gig_orders: [{ id: "o1", gig_id: "g1", buyer_id: "buyer", status: "pending_payment" }],
    });
    const res = await POST(req({ currency: "sol", refund_address: BUYER_SOL }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).order_id).toBe("o1");
    expect(createEscrow).not.toHaveBeenCalled();
  });

  describe("seller paid by PayPal (no crypto wallet)", () => {
    const PAYPAL = "lily@example.com";
    beforeEach(() => {
      process.env.UGIG_PAYPAL_BUY_NOW = "true";
      vi.mocked(getCoinpayLink).mockResolvedValue({ state: "none", wallets: null } as any);
      state.db = fakeSupabase({
        gigs: [gig],
        gig_orders: [],
        seller_payout_settings: [{ user_id: "seller", paypal_email: PAYPAL }],
      });
      vi.mocked(createPaypalPayment).mockResolvedValue({
        transaction_id: "ptx_2",
        approve_url: "https://paypal.test/approve",
        checkout_url: "https://coinpay.test/pay/paypal/ptx_2",
      });
    });
    afterEach(() => {
      delete process.env.UGIG_PAYPAL_BUY_NOW;
    });

    it("GET is buyable by card or PayPal only, and never shows the email", async () => {
      const res = await GET(req(), params);
      const body = await res.json();
      expect(body).toMatchObject({ buyable: true, paypal: true, methods: ["paypal"], currencies: [] });
      expect(JSON.stringify(body)).not.toContain(PAYPAL);
    });

    it("GET tells the owner Buy now is on, by PayPal, with the email masked", async () => {
      state.user = { id: "seller" };
      const body = await (await GET(req(), params)).json();
      expect(body).toMatchObject({
        owner: true,
        seller_ready: true,
        buyer_methods: ["paypal"],
        payout_methods: { crypto: false, paypal: "l***@example.com" },
      });
    });

    it("POST with PayPal records a PayPal payout to the seller's email", async () => {
      const res = await POST({ json: async () => ({ method: "paypal" }), nextUrl: { origin: "https://ugig.net" } } as any, params);
      expect(res.status).toBe(201);
      expect(state.db.inserts.gig_orders[0]).toMatchObject({
        payment_rail: "paypal",
        seller_payout_address: PAYPAL,
        payout_currency: "paypal",
        platform_fee_usd: 2.5,
      });
    });

    it("POST with crypto is refused with a pointer to card / PayPal", async () => {
      const res = await POST(req({ currency: "sol", refund_address: BUYER_SOL }), params);
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ methods: ["paypal"] });
      expect(createEscrow).not.toHaveBeenCalled();
    });

    it("prefers PayPal payout for a PayPal-paid order even when the seller also has a wallet", async () => {
      vi.mocked(getCoinpayLink).mockResolvedValue({ state: "connected", wallets: sellerWallets() } as any);
      const res = await POST({ json: async () => ({ method: "paypal" }), nextUrl: { origin: "https://ugig.net" } } as any, params);
      expect(res.status).toBe(201);
      expect(state.db.inserts.gig_orders[0]).toMatchObject({ payout_currency: "paypal" });
    });

    it("is not buyable when PayPal Buy now is off", async () => {
      delete process.env.UGIG_PAYPAL_BUY_NOW;
      const body = await (await GET(req(), params)).json();
      expect(body.buyable).toBe(false);
    });
  });
});
