import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/coinpayportal", () => ({
  createPayment: vi.fn(),
  findCoinpayGlobalWallet: vi.fn(
    (wallets, currency, address) =>
      wallets.find((wallet: any) => wallet.currency === currency && wallet.address === address) ||
      null
  ),
  getCoinpayGlobalWalletTokens: vi.fn(),
  preferredCoinToPaymentCurrency: vi.fn((value: string | null) => value?.toLowerCase() || null),
  resolveSupportedPaymentCurrency: vi.fn(),
}));

vi.mock("@/lib/coinpay-oauth", () => ({
  getConnectedCoinpayAccessToken: vi.fn(),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
  createServiceClient: vi.fn(() => ({
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({ data: { user: { email: "poster@example.com" } } }),
      },
    },
  })),
}));

vi.mock("@/lib/email", () => ({
  invoiceReceivedEmail: vi.fn(() => ({
    subject: "Invoice received",
    html: "<p>Invoice received</p>",
    text: "Invoice received",
  })),
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

// Keep isSatsCoin/satsToUsd real; pin the BTC price so sats→USD is deterministic.
vi.mock("@/lib/rates", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rates")>("@/lib/rates");
  return { ...actual, getBtcUsdRate: vi.fn().mockResolvedValue(100_000) };
});

import { GET, POST } from "./route";
import { createServiceClient, getAuthContext } from "@/lib/auth/get-user";
import {
  createPayment,
  getCoinpayGlobalWalletTokens,
  resolveSupportedPaymentCurrency,
} from "@/lib/coinpayportal";
import { getConnectedCoinpayAccessToken } from "@/lib/coinpay-oauth";
import { invoiceReceivedEmail, sendEmail } from "@/lib/email";

const GIG_ID = "8489a861-0999-4107-afca-2592021ac338";
const APP_ID = "d2317730-c56a-49e9-a6e4-dc469b7605f7";
const POSTER_ID = "4f16c625-c37a-4654-82db-e391067cbb13";
const WORKER_ID = "666cbaba-c6ea-4756-ad44-d6a5b4248f8f";

function req(body?: unknown) {
  return { json: () => Promise.resolve(body) } as any;
}
const params = { params: Promise.resolve({ id: GIG_ID }) };

function mockSupabase(overrides: Record<string, any> = {}) {
  const defaultChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return {
    from: vi.fn((table: string) => {
      if (overrides[table]) return overrides[table];
      return { ...defaultChain };
    }),
  };
}

function mockInvoiceTable({
  openInvoices = [],
  insertResult,
  onInsert,
  update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
}: {
  openInvoices?: any[];
  insertResult?: any;
  onInsert?: (row: any) => void;
  update?: any;
} = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: openInvoices, error: null }),
    update,
    insert: vi.fn((row: any) => {
      onInsert?.(row);
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: insertResult || { id: "local-inv-1", metadata: {} },
            error: null,
          }),
        }),
      };
    }),
  };
}

describe("GET /api/gigs/[id]/invoice", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 if not authenticated", async () => {
    (getAuthContext as any).mockResolvedValue(null);
    const res = await GET(req(), params);
    expect(res.status).toBe(401);
  });

  it("returns invoices for authenticated user", async () => {
    const invoices = [{ id: "inv-1", status: "sent", amount_usd: 100 }];
    const sb = mockSupabase({
      gig_invoices: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: invoices, error: null }),
      },
    });
    (getAuthContext as any).mockResolvedValue({ user: { id: WORKER_ID }, supabase: sb });
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe("inv-1");
  });
});

describe("POST /api/gigs/[id]/invoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getConnectedCoinpayAccessToken as any).mockResolvedValue("coinpay-access-token");
    (getCoinpayGlobalWalletTokens as any).mockResolvedValue([
      {
        currency: "sol",
        cryptocurrency: "SOL",
        label: "Solana wallet",
        address: "So11111111111111111111111111111111111111112",
        network: "SOL",
      },
    ]);
  });

  it("returns 401 if not authenticated", async () => {
    (getAuthContext as any).mockResolvedValue(null);
    const res = await POST(req({ application_id: APP_ID, amount: 100 }), params);
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing application_id", async () => {
    (getAuthContext as any).mockResolvedValue({ user: { id: WORKER_ID }, supabase: {} });
    const res = await POST(req({ amount: 100 }), params);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing amount", async () => {
    (getAuthContext as any).mockResolvedValue({ user: { id: WORKER_ID }, supabase: {} });
    const res = await POST(req({ application_id: APP_ID }), params);
    expect(res.status).toBe(400);
  });

  it("returns 400 for negative amount", async () => {
    (getAuthContext as any).mockResolvedValue({ user: { id: WORKER_ID }, supabase: {} });
    const res = await POST(req({ application_id: APP_ID, amount: -50 }), params);
    expect(res.status).toBe(400);
  });

  it("returns 404 when gig not found", async () => {
    const sb = mockSupabase({
      gigs: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      },
    });
    (getAuthContext as any).mockResolvedValue({ user: { id: WORKER_ID }, supabase: sb });
    const res = await POST(req({ application_id: APP_ID, amount: 100 }), params);
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is neither worker nor poster", async () => {
    const sb = mockSupabase({
      gigs: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: GIG_ID, title: "Test Gig", poster_id: POSTER_ID },
          error: null,
        }),
      },
      applications: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: APP_ID, applicant_id: "someone-else", status: "accepted" },
          error: null,
        }),
      },
    });
    (getAuthContext as any).mockResolvedValue({ user: { id: WORKER_ID }, supabase: sb });
    const res = await POST(req({ application_id: APP_ID, amount: 100 }), params);
    expect(res.status).toBe(403);
  });

  it("returns 400 when application is not accepted", async () => {
    const sb = mockSupabase({
      gigs: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: GIG_ID, title: "Test Gig", poster_id: POSTER_ID },
          error: null,
        }),
      },
      applications: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: APP_ID, applicant_id: WORKER_ID, status: "pending" },
          error: null,
        }),
      },
    });
    (getAuthContext as any).mockResolvedValue({ user: { id: WORKER_ID }, supabase: sb });
    const res = await POST(req({ application_id: APP_ID, amount: 100 }), params);
    expect(res.status).toBe(400);
  });

  it("creates a pending invoice with the worker's CoinPay receiving wallet", async () => {
    const gig = { id: GIG_ID, title: "Test Gig", poster_id: POSTER_ID, payment_coin: "SOL" };
    const application = {
      id: APP_ID,
      applicant_id: WORKER_ID,
      status: "accepted",
      proposed_rate: 150,
    };
    const invoiceRecord = {
      id: "local-inv-1",
      metadata: {
        invoice_currency: "USD",
        initiated_by: "worker",
        receiver_payment_currency: "sol",
        merchant_wallet_address: "So11111111111111111111111111111111111111112",
      },
    };

    const sb = mockSupabase({
      gigs: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: gig, error: null }),
      },
      applications: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: application, error: null }),
      },
      gig_invoices: mockInvoiceTable({ insertResult: invoiceRecord }),
      profiles: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi
          .fn()
          .mockResolvedValue({
            data: { username: "testworker", full_name: "Test Worker" },
            error: null,
          }),
      },
      notifications: {
        insert: vi.fn().mockResolvedValue({ error: null }),
      },
    });

    (getAuthContext as any).mockResolvedValue({ user: { id: WORKER_ID }, supabase: sb });

    const res = await POST(
      req({
        application_id: APP_ID,
        amount: 150,
        payment_currency: "sol",
        merchant_wallet_address: "So11111111111111111111111111111111111111112",
        notes: "Work completed",
      }),
      params
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.invoice_id).toBe("local-inv-1");
    expect(body.data.coinpay_invoice_id).toBeNull();
    expect(body.data.pay_url).toBeNull();
    expect(body.data.payment_address).toBeNull();
    expect(body.data.payment_currency).toBe("sol");
    expect(createPayment).not.toHaveBeenCalled();
    expect(resolveSupportedPaymentCurrency).not.toHaveBeenCalled();
    expect(invoiceReceivedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        workerName: "Test Worker",
        gigTitle: "Test Gig",
        amountUsd: 150,
        invoiceId: "local-inv-1",
      })
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "poster@example.com", subject: "Invoice received" })
    );
  });

  it("allows the poster to create an invoice for the accepted worker", async () => {
    const gig = { id: GIG_ID, title: "Test Gig", poster_id: POSTER_ID, payment_coin: "SOL" };
    const application = {
      id: APP_ID,
      applicant_id: WORKER_ID,
      status: "accepted",
      proposed_rate: 200,
    };
    const invoiceRecord = { id: "local-inv-2", metadata: {} };

    let inserted: any = null;
    const sb = mockSupabase({
      gigs: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: gig, error: null }),
      },
      applications: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: application, error: null }),
      },
      gig_invoices: mockInvoiceTable({
        insertResult: invoiceRecord,
        onInsert: (row) => {
          inserted = row;
        },
      }),
      profiles: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi
          .fn()
          .mockResolvedValue({
            data: { username: "client", full_name: "The Client" },
            error: null,
          }),
      },
      notifications: {
        insert: vi.fn().mockResolvedValue({ error: null }),
      },
    });

    (getAuthContext as any).mockResolvedValue({ user: { id: POSTER_ID }, supabase: sb });

    const res = await POST(
      req({
        application_id: APP_ID,
        amount: 200,
        payment_currency: "sol",
        merchant_wallet_address: "So11111111111111111111111111111111111111112",
      }),
      params
    );

    expect(res.status).toBe(201);
    expect(inserted).toMatchObject({
      worker_id: WORKER_ID,
      poster_id: POSTER_ID,
      amount_usd: 200,
      coinpay_invoice_id: null,
      metadata: expect.objectContaining({
        initiated_by: "poster",
        receiver_payment_currency: "sol",
        merchant_wallet_address: "So11111111111111111111111111111111111111112",
      }),
    });
    expect(createPayment).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns the existing invoice when the request is a retry (same amount, recent)", async () => {
    const gig = { id: GIG_ID, title: "Test Gig", poster_id: POSTER_ID, payment_coin: "SOL" };
    const application = {
      id: APP_ID,
      applicant_id: WORKER_ID,
      status: "accepted",
      proposed_rate: 150,
    };
    const existingInvoice = {
      id: "local-inv-existing",
      coinpay_invoice_id: "cp-pay-existing",
      pay_url: null,
      status: "sent",
      amount_usd: 150,
      created_at: new Date().toISOString(),
      metadata: {
        payment_address: "So11111111111111111111111111111111111111112",
        amount_crypto: 0.75,
        payment_currency: "sol",
        native_amount: 150,
        expires_at: new Date(Date.now() + 28 * 60 * 60 * 1000).toISOString(),
      },
    };

    const sb = mockSupabase({
      gigs: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: gig, error: null }),
      },
      applications: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: application, error: null }),
      },
      gig_invoices: mockInvoiceTable({ openInvoices: [existingInvoice] }),
    });

    (getAuthContext as any).mockResolvedValue({ user: { id: WORKER_ID }, supabase: sb });

    const res = await POST(req({ application_id: APP_ID, amount: 150 }), params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.invoice_id).toBe("local-inv-existing");
    expect(body.data.coinpay_invoice_id).toBe("cp-pay-existing");
    expect(body.data.payment_address).toBe("So11111111111111111111111111111111111111112");
    expect(createPayment).not.toHaveBeenCalled();
  });

  function newInvoiceMocks(existingInvoice: any) {
    const gig = { id: GIG_ID, title: "Test Gig", poster_id: POSTER_ID, payment_coin: "SOL" };
    const application = {
      id: APP_ID,
      applicant_id: WORKER_ID,
      status: "accepted",
      proposed_rate: 150,
    };
    return mockSupabase({
      gigs: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: gig, error: null }),
      },
      applications: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: application, error: null }),
      },
      gig_invoices: mockInvoiceTable({
        openInvoices: existingInvoice ? [existingInvoice] : [],
        insertResult: { id: "local-inv-new", metadata: {} },
      }),
      profiles: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi
          .fn()
          .mockResolvedValue({ data: { username: "w", full_name: "Test Worker" }, error: null }),
      },
      notifications: { insert: vi.fn().mockResolvedValue({ error: null }) },
    });
  }

  it("creates a new invoice when an open invoice has a different amount", async () => {
    const sb = newInvoiceMocks({
      id: "local-inv-existing",
      coinpay_invoice_id: null,
      pay_url: null,
      status: "sent",
      amount_usd: 150,
      created_at: new Date().toISOString(),
      metadata: { native_amount: 150 },
    });
    (getAuthContext as any).mockResolvedValue({ user: { id: WORKER_ID }, supabase: sb });

    const res = await POST(
      req({
        application_id: APP_ID,
        amount: 100,
        payment_currency: "sol",
        merchant_wallet_address: "So11111111111111111111111111111111111111112",
      }),
      params
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.invoice_id).toBe("local-inv-new");
  });

  it("creates a new invoice when the matching open invoice is outside the retry window", async () => {
    const sb = newInvoiceMocks({
      id: "local-inv-existing",
      coinpay_invoice_id: null,
      pay_url: null,
      status: "sent",
      amount_usd: 150,
      created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      metadata: { native_amount: 150 },
    });
    (getAuthContext as any).mockResolvedValue({ user: { id: WORKER_ID }, supabase: sb });

    const res = await POST(
      req({
        application_id: APP_ID,
        amount: 150,
        payment_currency: "sol",
        merchant_wallet_address: "So11111111111111111111111111111111111111112",
      }),
      params
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.invoice_id).toBe("local-inv-new");
  });

  it("rejects an invoice total above the agreed amount on a fixed-price gig", async () => {
    const gig = {
      id: GIG_ID,
      title: "Test Gig",
      poster_id: POSTER_ID,
      payment_coin: "SOL",
      budget_type: "fixed",
      budget_min: 100,
      budget_max: 200,
    };
    const application = {
      id: APP_ID,
      applicant_id: WORKER_ID,
      status: "accepted",
      proposed_rate: 150,
    };

    const sb = mockSupabase({
      gigs: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: gig, error: null }),
      },
      applications: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: application, error: null }),
      },
    });
    (getAuthContext as any).mockResolvedValue({ user: { id: WORKER_ID }, supabase: sb });

    const res = await POST(req({ application_id: APP_ID, amount: 999 }), params);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/exceeds the agreed amount/i);
    // Rejected before any wallet/payment work happens.
    expect(createPayment).not.toHaveBeenCalled();
  });

  it("caps bounty-type gigs at the agreed amount too (not just fixed)", async () => {
    const gig = {
      id: GIG_ID,
      title: "Bounty Gig",
      poster_id: POSTER_ID,
      payment_coin: "SOL",
      budget_type: "bounty",
      budget_min: 1000,
      budget_max: 1000,
    };
    const application = {
      id: APP_ID,
      applicant_id: WORKER_ID,
      status: "accepted",
      proposed_rate: 1000,
    };

    const sb = mockSupabase({
      gigs: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: gig, error: null }),
      },
      applications: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: application, error: null }),
      },
    });
    (getAuthContext as any).mockResolvedValue({ user: { id: WORKER_ID }, supabase: sb });

    const res = await POST(req({ application_id: APP_ID, amount: 1_000_000 }), params);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/exceeds the agreed amount/i);
  });

  it("rejects a fixed gig with no agreed amount anywhere instead of leaving it uncapped", async () => {
    const gig = {
      id: GIG_ID,
      title: "Budgetless Gig",
      poster_id: POSTER_ID,
      payment_coin: "SOL",
      budget_type: "fixed",
      budget_min: null,
      budget_max: null,
    };
    const application = {
      id: APP_ID,
      applicant_id: WORKER_ID,
      status: "accepted",
      proposed_rate: null,
    };

    const sb = mockSupabase({
      gigs: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: gig, error: null }),
      },
      applications: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: application, error: null }),
      },
    });
    (getAuthContext as any).mockResolvedValue({ user: { id: WORKER_ID }, supabase: sb });

    const res = await POST(req({ application_id: APP_ID, amount: 5000 }), params);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no agreed amount/i);
  });

  it("denominates a sats gig's invoice in USD instead of treating sats as dollars", async () => {
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

    let inserted: any = null;
    const sb = mockSupabase({
      gigs: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: gig, error: null }),
      },
      applications: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: application, error: null }),
      },
      gig_invoices: mockInvoiceTable({
        insertResult: { id: "local-inv-sats", metadata: {} },
        onInsert: (row) => {
          inserted = row;
        },
      }),
      profiles: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi
          .fn()
          .mockResolvedValue({ data: { username: "w", full_name: "W" }, error: null }),
      },
      notifications: { insert: vi.fn().mockResolvedValue({ error: null }) },
    });
    (getAuthContext as any).mockResolvedValue({ user: { id: WORKER_ID }, supabase: sb });

    const res = await POST(
      req({
        application_id: APP_ID,
        amount: 500,
        payment_currency: "sol",
        merchant_wallet_address: "So11111111111111111111111111111111111111112",
      }),
      params
    );

    expect(res.status).toBe(201);
    // 500 sats at $100,000/BTC = $0.50, NOT $500.
    expect(inserted.amount_usd).toBe(0.5);
    expect(inserted.metadata).toMatchObject({
      posting_coin: "SATS",
      native_unit: "sats",
      native_amount: 500,
    });
  });

  it("stores merged GitHub PR links in metadata and passes them to the email", async () => {
    const gig = { id: GIG_ID, title: "Test Gig", poster_id: POSTER_ID, payment_coin: "SOL" };
    const application = {
      id: APP_ID,
      applicant_id: WORKER_ID,
      status: "accepted",
      proposed_rate: 150,
    };
    const prLinks = [
      "https://github.com/profullstack/ugig.net/pull/42",
      "https://github.com/profullstack/ugig.net/pull/43",
    ];

    let inserted: any = null;
    const sb = mockSupabase({
      gigs: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: gig, error: null }),
      },
      applications: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: application, error: null }),
      },
      gig_invoices: mockInvoiceTable({
        insertResult: { id: "local-inv-pr", metadata: {} },
        onInsert: (row) => {
          inserted = row;
        },
      }),
      profiles: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi
          .fn()
          .mockResolvedValue({ data: { username: "w", full_name: "Test Worker" }, error: null }),
      },
      notifications: { insert: vi.fn().mockResolvedValue({ error: null }) },
    });
    (getAuthContext as any).mockResolvedValue({ user: { id: WORKER_ID }, supabase: sb });

    const res = await POST(
      req({
        application_id: APP_ID,
        amount: 150,
        payment_currency: "sol",
        merchant_wallet_address: "So11111111111111111111111111111111111111112",
        // Duplicate + whitespace to exercise de-duping/trimming.
        pr_links: [...prLinks, ` ${prLinks[0]} `],
      }),
      params
    );

    expect(res.status).toBe(201);
    expect(inserted.metadata.pr_links).toEqual(prLinks);
    expect(invoiceReceivedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ prLinks })
    );
  });

  it("accepts a GitHub PR search URL (merged PRs by author) and stores item links", async () => {
    const sb = newInvoiceMocks(null);
    (getAuthContext as any).mockResolvedValue({ user: { id: WORKER_ID }, supabase: sb });

    let itemRows: any[] | null = null;
    (createServiceClient as any).mockReturnValue({
      auth: {
        admin: {
          getUserById: vi
            .fn()
            .mockResolvedValue({ data: { user: { email: "poster@example.com" } } }),
        },
      },
      from: vi.fn(() => ({
        insert: vi.fn((rows: any[]) => {
          itemRows = rows;
          return Promise.resolve({ error: null });
        }),
      })),
    });

    const searchUrl =
      "https://github.com/profullstack/ugig.net/pulls?q=is%3Apr+is%3Amerged+author%3Achovy";
    const res = await POST(
      req({
        application_id: APP_ID,
        items: [{ description: "Pull requests", quantity: 8, unit_price: 1, link: searchUrl }],
        payment_currency: "sol",
        merchant_wallet_address: "So11111111111111111111111111111111111111112",
        pr_links: [searchUrl],
      }),
      params
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.items).toEqual([
      expect.objectContaining({
        description: "Pull requests",
        quantity: 8,
        unit_price_usd: 1,
        amount_usd: 8,
        link: searchUrl,
      }),
    ]);
    expect(itemRows).toEqual([
      expect.objectContaining({ quantity: 8, unit_price_usd: 1, amount_usd: 8, link: searchUrl }),
    ]);
  });

  it("rejects a line item link that is not a GitHub PR URL", async () => {
    const res = await POST(
      req({
        application_id: APP_ID,
        items: [
          {
            description: "Pull requests",
            quantity: 8,
            unit_price: 1,
            link: "https://example.com/prs",
          },
        ],
        payment_currency: "sol",
        merchant_wallet_address: "So11111111111111111111111111111111111111112",
      }),
      params
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/GitHub pull request/i);
  });

  it("rejects PR links that are not GitHub pull request URLs", async () => {
    const res = await POST(
      req({
        application_id: APP_ID,
        amount: 150,
        payment_currency: "sol",
        merchant_wallet_address: "So11111111111111111111111111111111111111112",
        pr_links: ["https://gitlab.com/org/repo/-/merge_requests/1"],
      }),
      params
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/GitHub pull request/i);
  });
});
