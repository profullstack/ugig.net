import { describe, it, expect, vi, beforeEach } from "vitest";

// End-to-end money-path guard: run the invoice-creation route to PRODUCE
// amount_usd, then feed that stored invoice into the payment-request route and
// assert the poster is charged the right USD in the worker's chosen coin.
// A regression in either link (sats→USD conversion, or forwarding amount_usd to
// CoinPay) shows up here as "charged the wrong amount".

vi.mock("@/lib/coinpayportal", () => ({
  createPayment: vi.fn(),
  findCoinpayGlobalWallet: vi.fn(
    (wallets, currency, address) =>
      wallets.find((w: any) => w.currency === currency && w.address === address) || null
  ),
  getCoinpayGlobalWalletTokens: vi.fn(),
  preferredCoinToPaymentCurrency: vi.fn((v: string | null) => v?.toLowerCase() || null),
  resolveSupportedPaymentCurrency: vi.fn(),
}));

vi.mock("@/lib/coinpay-oauth", () => ({
  getConnectedCoinpayAccessToken: vi.fn(),
  getCoinpayLink: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  invoiceReceivedEmail: vi.fn(() => ({ subject: "s", html: "h", text: "t" })),
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

// Pin BTC price so sats→USD is deterministic; keep isSatsCoin/satsToUsd real.
vi.mock("@/lib/rates", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rates")>("@/lib/rates");
  return { ...actual, getBtcUsdRate: vi.fn().mockResolvedValue(100_000) };
});

// Shared in-memory invoice store so the row created by the invoice route is the
// one the payment-request route later charges.
const store: { invoice: any } = { invoice: null };

const GIG_ID = "8489a861-0999-4107-afca-2592021ac338";
const APP_ID = "d2317730-c56a-49e9-a6e4-dc469b7605f7";
const POSTER_ID = "4f16c625-c37a-4654-82db-e391067cbb13";
const WORKER_ID = "666cbaba-c6ea-4756-ad44-d6a5b4248f8f";
const SOL_ADDRESS = "So11111111111111111111111111111111111111112";

const gig = {
  id: GIG_ID,
  title: "Sats Gig",
  poster_id: POSTER_ID,
  payment_coin: "SATS",
  budget_type: "fixed",
  budget_min: 500,
  budget_max: 500,
};
const application = {
  id: APP_ID,
  applicant_id: WORKER_ID,
  status: "accepted",
  proposed_rate: 500,
};

function makeChain(overrides: Record<string, any> = {}) {
  const c: any = {};
  ["select", "eq", "or", "in", "order"].forEach((m) => (c[m] = vi.fn(() => c)));
  c.single = overrides.single || vi.fn().mockResolvedValue({ data: null, error: null });
  c.maybeSingle = overrides.maybeSingle || vi.fn().mockResolvedValue({ data: null, error: null });
  c.limit = overrides.limit || vi.fn().mockResolvedValue({ data: [], error: null });
  if (overrides.insert) c.insert = overrides.insert;
  if (overrides.update) c.update = overrides.update;
  return c;
}

// Supabase client shared by both route handlers (via getAuthContext).
const supabase: any = {
  from: vi.fn((table: string) => {
    switch (table) {
      case "gigs":
        return makeChain({ single: () => Promise.resolve({ data: gig, error: null }) });
      case "applications":
        return makeChain({ single: () => Promise.resolve({ data: application, error: null }) });
      case "gig_invoices":
        return makeChain({
          // invoice route: no open invoice yet
          limit: () => Promise.resolve({ data: [], error: null }),
          // invoice route: persist the new row
          insert: (row: any) => {
            store.invoice = { id: "inv-e2e", ...row };
            return {
              select: () => ({
                single: () => Promise.resolve({ data: store.invoice, error: null }),
              }),
            };
          },
          // payment-request route: fetch the stored invoice (with gig joined)
          maybeSingle: () =>
            Promise.resolve({
              data: store.invoice
                ? {
                    ...store.invoice,
                    gig: { id: GIG_ID, title: gig.title, payment_coin: gig.payment_coin },
                  }
                : null,
              error: null,
            }),
        });
      case "profiles":
        return makeChain({
          single: () =>
            Promise.resolve({ data: { username: "w", full_name: "Worker" }, error: null }),
        });
      case "notifications":
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      default:
        return makeChain();
    }
  }),
};

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
  createServiceClient: vi.fn(() => ({
    from: () => ({ insert: vi.fn().mockResolvedValue({ error: null }) }),
    auth: {
      admin: {
        getUserById: vi
          .fn()
          .mockResolvedValue({ data: { user: { email: "poster@example.com" } } }),
      },
    },
  })),
}));

// payment-request route imports createServiceClient from a different module.
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: () => ({
      update: () => ({
        eq: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: store.invoice, error: null }),
          }),
        }),
      }),
    }),
  })),
}));

import { POST as createInvoice } from "./route";
import { POST as payInvoice } from "./[invoiceId]/payment-request/route";
import { getAuthContext } from "@/lib/auth/get-user";
import {
  createPayment,
  getCoinpayGlobalWalletTokens,
  preferredCoinToPaymentCurrency,
} from "@/lib/coinpayportal";
import { getConnectedCoinpayAccessToken, getCoinpayLink } from "@/lib/coinpay-oauth";

function req(body?: unknown) {
  return { json: () => Promise.resolve(body) } as any;
}

describe("invoice money path (sats gig, end to end)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.invoice = null;
    (preferredCoinToPaymentCurrency as any).mockImplementation(
      (v: string | null) => v?.toLowerCase() || null
    );
    (getConnectedCoinpayAccessToken as any).mockResolvedValue("token");
    (getCoinpayLink as any).mockResolvedValue({ state: "connected", accessToken: "token" });
    (getCoinpayGlobalWalletTokens as any).mockResolvedValue([
      { currency: "sol", cryptocurrency: "SOL", label: "Solana", address: SOL_ADDRESS },
    ]);
    (createPayment as any).mockResolvedValue({
      payment_id: "cp-1",
      payment: { payment_address: "cp-addr", currency: "sol" },
      amount_crypto: 0.001,
      checkout_url: "https://pay",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
  });

  it("charges the poster the USD value of the gig's sats, in the worker's coin — not the raw sats as dollars", async () => {
    // 1. Worker creates the invoice for the agreed 500 sats.
    (getAuthContext as any).mockResolvedValueOnce({ user: { id: WORKER_ID }, supabase });
    const createRes = await createInvoice(
      req({
        application_id: APP_ID,
        amount: 500, // 500 *sats*
        payment_currency: "sol",
        merchant_wallet_address: SOL_ADDRESS,
      }),
      { params: Promise.resolve({ id: GIG_ID }) }
    );
    expect(createRes.status).toBe(201);

    // The stored canonical USD is 500 sats @ $100k/BTC = $0.50, not $500.
    expect(store.invoice.amount_usd).toBe(0.5);
    expect(store.invoice.metadata).toMatchObject({ native_unit: "sats", native_amount: 500 });

    // 2. Poster pays it → the actual CoinPay charge.
    (getAuthContext as any).mockResolvedValueOnce({ user: { id: POSTER_ID }, supabase });
    const payRes = await payInvoice(
      req({}),
      { params: Promise.resolve({ id: GIG_ID, invoiceId: "inv-e2e" }) }
    );
    expect(payRes.status).toBe(200);

    // CoinPay is charged $0.50 worth of SOL — coin stays flexible, amount is correct.
    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount_usd: 0.5, currency: "sol" })
    );
  });
});
