import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/coinpayportal", () => ({
  createPayment: vi.fn(),
  preferredCoinToPaymentCurrency: vi.fn((value: string | null) => value?.toLowerCase() || null),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
}));

import { POST } from "./route";
import { createPayment } from "@/lib/coinpayportal";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { CoinpayRateLimitError } from "@/lib/coinpay-throttle";

const POSTER_ID = "4f16c625-c37a-4654-82db-e391067cbb13";
const WORKER_ID = "666cbaba-c6ea-4756-ad44-d6a5b4248f8f";
const GIG_ID = "8489a861-0999-4107-afca-2592021ac338";
const WALLET = "So11111111111111111111111111111111111111112";

const ID_A = "f53e4a56-3cf7-42f9-9a33-bc1cb770c4f6";
const ID_B = "a1b2c3d4-1111-4222-8333-444455556666";
const ID_C = "c0ffee00-2222-4333-8444-555566667777";

function request(body: unknown) {
  return { json: async () => body } as any;
}

/** Supabase select(...).in(...).eq(...) resolving to the given rows. */
function selectQuery(rows: any[]) {
  const query: any = {
    select: vi.fn(() => query),
    in: vi.fn(() => query),
    eq: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  return query;
}

function serviceClient() {
  return {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            // Echo back whatever id was written; the route only reads `id` and
            // `metadata` off this row.
            single: vi.fn(async () => ({
              data: { id: lastUpdatedId, metadata: lastUpdatedMetadata },
              error: null,
            })),
          })),
        })),
      })),
    })),
  };
}

let lastUpdatedId = ID_A;
let lastUpdatedMetadata: Record<string, unknown> = {};

function invoice(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    gig_id: GIG_ID,
    application_id: "d2317730-c56a-49e9-a6e4-dc469b7605f7",
    worker_id: WORKER_ID,
    poster_id: POSTER_ID,
    amount_usd: 100,
    currency: "USD",
    status: "sent",
    coinpay_invoice_id: null,
    pay_url: null,
    notes: null,
    metadata: {
      accepted_at: "2026-07-01T00:00:00Z",
      receiver_payment_currency: "sol",
      merchant_wallet_address: WALLET,
    },
    gig: { id: GIG_ID, title: "Build thing", payment_coin: "SOL" },
    worker: { id: WORKER_ID, username: "ada", full_name: "Ada Lovelace" },
    ...overrides,
  };
}

function mockAuth(rows: any[]) {
  (getAuthContext as any).mockResolvedValue({
    user: { id: POSTER_ID },
    supabase: { from: vi.fn(() => selectQuery(rows)) },
  });
  (createServiceClient as any).mockReturnValue(serviceClient());
}

function mockPaymentCreation() {
  let counter = 0;
  (createPayment as any).mockImplementation(async (opts: any) => {
    counter++;
    lastUpdatedId = opts.metadata.invoice_id;
    lastUpdatedMetadata = {
      payment_address: `addr-${counter}`,
      amount_crypto: "1.25",
      payment_currency: "sol",
      expires_at: "2030-01-01T00:00:00Z",
    };
    return {
      payment_id: `cp-${counter}`,
      address: `addr-${counter}`,
      amount_crypto: "1.25",
      currency: "sol",
      expires_at: "2030-01-01T00:00:00Z",
      payment: { id: `cp-${counter}` },
    };
  });
}

describe("POST /api/invoices/bulk-payment-request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastUpdatedMetadata = {};
  });

  it("prepares a payment for every accepted invoice", async () => {
    mockAuth([invoice(ID_A), invoice(ID_B)]);
    mockPaymentCreation();

    const res = await POST(request({ invoice_ids: [ID_A, ID_B] }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.payments).toHaveLength(2);
    expect(body.data.skipped).toHaveLength(0);
    expect(body.data.total_usd).toBe(200);
    expect(createPayment).toHaveBeenCalledTimes(2);
  });

  it("shapes each payment for the wallet's payBatch call", async () => {
    mockAuth([invoice(ID_A)]);
    mockPaymentCreation();

    const res = await POST(request({ invoice_ids: [ID_A] }));
    const body = await res.json();

    expect(body.data.payments[0]).toMatchObject({
      id: ID_A, // correlation id must be the invoice id
      chain: "sol",
      to: "addr-1",
      amount: "1.25",
      amountUsd: 100,
      label: "Ada Lovelace — Build thing",
    });
  });

  it("skips invoices that were never accepted", async () => {
    mockAuth([invoice(ID_A, { metadata: { receiver_payment_currency: "sol" } })]);
    mockPaymentCreation();

    const res = await POST(request({ invoice_ids: [ID_A] }));
    const body = await res.json();

    expect(body.data.payments).toHaveLength(0);
    expect(body.data.skipped).toEqual([{ id: ID_A, reason: "Not accepted yet" }]);
    expect(createPayment).not.toHaveBeenCalled();
  });

  it("skips already-paid invoices instead of charging twice", async () => {
    mockAuth([invoice(ID_A, { status: "paid" })]);
    mockPaymentCreation();

    const res = await POST(request({ invoice_ids: [ID_A] }));
    const body = await res.json();

    expect(body.data.payments).toHaveLength(0);
    expect(body.data.skipped).toEqual([{ id: ID_A, reason: "Already paid" }]);
    expect(createPayment).not.toHaveBeenCalled();
  });

  it("skips invoices the caller does not own, and never leaks their existence", async () => {
    // The query filters on poster_id, so someone else's invoice comes back empty.
    mockAuth([invoice(ID_A)]);
    mockPaymentCreation();

    const res = await POST(request({ invoice_ids: [ID_A, ID_B] }));
    const body = await res.json();

    expect(body.data.payments.map((p: any) => p.id)).toEqual([ID_A]);
    expect(body.data.skipped).toEqual([
      { id: ID_B, reason: "Not found, or you are not the payer" },
    ]);
  });

  it("accounts for every requested invoice in exactly one bucket", async () => {
    mockAuth([invoice(ID_A), invoice(ID_B, { status: "paid" })]);
    mockPaymentCreation();

    const res = await POST(request({ invoice_ids: [ID_A, ID_B, ID_C] }));
    const body = await res.json();

    const seen = [
      ...body.data.payments.map((p: any) => p.id),
      ...body.data.skipped.map((s: any) => s.id),
    ];
    // An invoice missing from both lists would silently look paid.
    expect(seen.sort()).toEqual([ID_A, ID_B, ID_C].sort());
  });

  it("reports a provider failure as a skip rather than failing the whole batch", async () => {
    mockAuth([invoice(ID_A), invoice(ID_B)]);
    let calls = 0;
    (createPayment as any).mockImplementation(async (opts: any) => {
      calls++;
      if (opts.metadata.invoice_id === ID_A) throw new Error("CoinPay is down");
      lastUpdatedId = opts.metadata.invoice_id;
      lastUpdatedMetadata = {};
      return {
        payment_id: `cp-${calls}`,
        address: `addr-${calls}`,
        amount_crypto: "1.25",
        currency: "sol",
        expires_at: "2030-01-01T00:00:00Z",
        payment: { id: `cp-${calls}` },
      };
    });

    const res = await POST(request({ invoice_ids: [ID_A, ID_B] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.payments.map((p: any) => p.id)).toEqual([ID_B]);
    expect(body.data.skipped[0]).toMatchObject({ id: ID_A, reason: "CoinPay is down" });
  });

  it("marks a rate-limited invoice retryable, not written off", async () => {
    // The bug this guards: CoinPay limits every /api/ route to 60 requests a
    // minute per IP, so a bulk run exhausts it mid-batch. Every one of those is
    // a payable invoice — reporting them like "already paid" or "not accepted"
    // is how a whole payroll run got reported as un-payable.
    mockAuth([invoice(ID_A), invoice(ID_B)]);
    mockPaymentCreation();
    const succeed = (createPayment as any).getMockImplementation();
    (createPayment as any).mockImplementation(async (opts: any) => {
      if (opts.metadata.invoice_id === ID_A) throw new CoinpayRateLimitError();
      return succeed(opts);
    });

    const res = await POST(request({ invoice_ids: [ID_A, ID_B] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.payments.map((p: any) => p.id)).toEqual([ID_B]);
    expect(body.data.skipped).toHaveLength(1);
    expect(body.data.skipped[0]).toMatchObject({ id: ID_A, retryable: true });
    expect(body.data.skipped[0].reason).toMatch(/rate limit/i);
  });

  it("does not mark a genuine provider rejection retryable", async () => {
    mockAuth([invoice(ID_A)]);
    (createPayment as any).mockRejectedValue(new Error("CoinPay create failed 400: bad currency"));

    const res = await POST(request({ invoice_ids: [ID_A] }));
    const body = await res.json();

    expect(body.data.skipped[0]).toMatchObject({ id: ID_A, retryable: false });
  });

  it("bounds the batch with one shared deadline so early quotes stay live", async () => {
    mockAuth([invoice(ID_A), invoice(ID_B)]);
    mockPaymentCreation();

    await POST(request({ invoice_ids: [ID_A, ID_B] }));

    const deadlines = (createPayment as any).mock.calls.map((c: any[]) => c[0].deadline);
    expect(deadlines).toHaveLength(2);
    expect(deadlines[0]).toBeGreaterThan(Date.now());
    // One deadline for the run, not a fresh budget per invoice — otherwise the
    // last invoice could still be waiting long after the first quote expired.
    expect(deadlines[1]).toBe(deadlines[0]);
  });

  it("skips an invoice with no quoted crypto amount", async () => {
    mockAuth([invoice(ID_A)]);
    (createPayment as any).mockResolvedValue({
      payment_id: "cp-1",
      address: "addr-1",
      amount_crypto: null,
      currency: "sol",
      expires_at: "2030-01-01T00:00:00Z",
      payment: { id: "cp-1" },
    });

    const res = await POST(request({ invoice_ids: [ID_A] }));
    const body = await res.json();

    expect(body.data.payments).toHaveLength(0);
    expect(body.data.skipped[0].reason).toMatch(/did not quote a crypto amount/);
  });

  it("reuses an unexpired request instead of minting a second one", async () => {
    mockAuth([
      invoice(ID_A, {
        coinpay_invoice_id: "cp-existing",
        metadata: {
          accepted_at: "2026-07-01T00:00:00Z",
          receiver_payment_currency: "sol",
          merchant_wallet_address: WALLET,
          payment_address: "addr-existing",
          amount_crypto: "2.5",
          payment_currency: "sol",
          expires_at: "2030-01-01T00:00:00Z",
        },
      }),
    ]);
    mockPaymentCreation();

    const res = await POST(request({ invoice_ids: [ID_A] }));
    const body = await res.json();

    // Two live deposit addresses for one debt is how a worker gets paid twice.
    expect(createPayment).not.toHaveBeenCalled();
    expect(body.data.payments[0]).toMatchObject({ to: "addr-existing", reused: true });
  });

  it("re-quotes when the existing request has expired", async () => {
    mockAuth([
      invoice(ID_A, {
        coinpay_invoice_id: "cp-old",
        metadata: {
          accepted_at: "2026-07-01T00:00:00Z",
          receiver_payment_currency: "sol",
          merchant_wallet_address: WALLET,
          payment_address: "addr-stale",
          amount_crypto: "2.5",
          payment_currency: "sol",
          expires_at: "2020-01-01T00:00:00Z",
        },
      }),
    ]);
    mockPaymentCreation();

    const res = await POST(request({ invoice_ids: [ID_A] }));
    const body = await res.json();

    expect(createPayment).toHaveBeenCalledTimes(1);
    expect(body.data.payments[0]).toMatchObject({ to: "addr-1", reused: false });
  });

  it("requires authentication", async () => {
    (getAuthContext as any).mockResolvedValue(null);

    const res = await POST(request({ invoice_ids: [ID_A] }));

    expect(res.status).toBe(401);
    expect(createPayment).not.toHaveBeenCalled();
  });

  it("rejects an empty or oversized batch", async () => {
    mockAuth([]);

    expect((await POST(request({ invoice_ids: [] }))).status).toBe(400);

    const tooMany = Array.from({ length: 101 }, () => ID_A);
    expect((await POST(request({ invoice_ids: tooMany }))).status).toBe(400);
    expect(createPayment).not.toHaveBeenCalled();
  });

  it("rejects a malformed body", async () => {
    mockAuth([]);

    expect((await POST(request({ invoice_ids: ["not-a-uuid"] }))).status).toBe(400);
    expect(
      (await POST({ json: async () => { throw new Error("bad"); } } as any)).status
    ).toBe(400);
  });
});
