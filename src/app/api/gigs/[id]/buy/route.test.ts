import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeSupabase } from "@/lib/orders/fake-supabase.test-helper";

const state = vi.hoisted(() => ({ db: null as any, user: { id: "buyer" } as { id: string } | null }));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(async () => (state.user ? { user: state.user, supabase: state.db.client } : null)),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => state.db.client }));
vi.mock("@/lib/coinpay-oauth", () => ({ getCoinpayLink: vi.fn() }));
vi.mock("@/lib/coinpayportal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/coinpayportal")>();
  return { ...actual, createEscrow: vi.fn(), readCoinpayUserinfoWallets: vi.fn() };
});

import { GET, POST } from "./route";
import { getCoinpayLink } from "@/lib/coinpay-oauth";
import { createEscrow, readCoinpayUserinfoWallets } from "@/lib/coinpayportal";

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

describe("/api/gigs/[id]/buy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.user = { id: "buyer" };
    state.db = fakeSupabase({ gigs: [gig], gig_orders: [] });
    vi.mocked(getCoinpayLink).mockResolvedValue({ state: "connected", accessToken: "tok" } as any);
    vi.mocked(readCoinpayUserinfoWallets).mockResolvedValue({
      status: "ok",
      wallets: [
        { currency: "sol", cryptocurrency: "SOL", label: null, address: SELLER_SOL },
        { currency: "usdt_pol", cryptocurrency: "USDT_POL", label: null, address: "0xabc" },
      ],
    } as any);
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
    vi.mocked(getCoinpayLink).mockResolvedValue({ state: "none", accessToken: null } as any);
    const res = await POST(req({ currency: "sol", refund_address: BUYER_SOL }), params);
    expect(res.status).toBe(409);
    expect(createEscrow).not.toHaveBeenCalled();
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
});
