import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/coinpayportal", () => ({
  createPayment: vi.fn(),
  preferredCoinToPaymentCurrency: vi.fn((value: string | null) => value?.toLowerCase() || null),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
}));

import {
  ensureInvoicePaymentRequest,
  activeExpiresAt,
  metadataObject,
  PAYABLE_INVOICE_STATUSES,
  PAYMENT_REQUEST_SECONDS,
} from "./payment-request";
import { createPayment } from "@/lib/coinpayportal";
import { createServiceClient } from "@/lib/supabase/service";

const INVOICE_ID = "f53e4a56-3cf7-42f9-9a33-bc1cb770c4f6";
const GIG_ID = "8489a861-0999-4107-afca-2592021ac338";
const WALLET = "So11111111111111111111111111111111111111112";

/** Captures the row written back to gig_invoices. */
function serviceClient() {
  const captured: { row?: any } = {};
  (createServiceClient as any).mockReturnValue({
    from: vi.fn(() => ({
      update: vi.fn((row: any) => {
        captured.row = row;
        return {
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: INVOICE_ID, metadata: row.metadata },
                error: null,
              })),
            })),
          })),
        };
      }),
    })),
  });
  return captured;
}

function invoice(metadata: Record<string, unknown> = {}, overrides: Record<string, any> = {}) {
  return {
    id: INVOICE_ID,
    gig_id: GIG_ID,
    application_id: "d2317730-c56a-49e9-a6e4-dc469b7605f7",
    worker_id: "666cbaba-c6ea-4756-ad44-d6a5b4248f8f",
    poster_id: "4f16c625-c37a-4654-82db-e391067cbb13",
    amount_usd: 125,
    currency: "USD",
    status: "sent",
    coinpay_invoice_id: null,
    pay_url: null,
    notes: "Milestone 1",
    metadata,
    gig: { id: GIG_ID, title: "Build thing", payment_coin: "SOL" },
    ...overrides,
  };
}

const WALLET_METADATA = {
  receiver_payment_currency: "sol",
  merchant_wallet_address: WALLET,
  merchant_wallet_label: "Solana wallet",
};

function mockCoinPaySuccess(overrides: Record<string, unknown> = {}) {
  (createPayment as any).mockResolvedValue({
    payment_id: "cp-1",
    address: "deposit-addr",
    amount_crypto: "0.42",
    currency: "sol",
    expires_at: "2030-01-01T00:00:00Z",
    payment: { id: "cp-1" },
    ...overrides,
  });
}

describe("metadataObject", () => {
  it("coerces non-objects to an empty object", () => {
    expect(metadataObject(null)).toEqual({});
    expect(metadataObject("nope")).toEqual({});
    expect(metadataObject(undefined)).toEqual({});
    expect(metadataObject({ a: 1 })).toEqual({ a: 1 });
  });
});

describe("activeExpiresAt", () => {
  it("returns a date only while the quote still holds", () => {
    expect(activeExpiresAt({ expires_at: "2030-01-01T00:00:00Z" })).toBeInstanceOf(Date);
  });

  it("treats past, missing, and malformed expiry as expired", () => {
    // Sending a stale quote would transfer the wrong crypto amount.
    expect(activeExpiresAt({ expires_at: "2020-01-01T00:00:00Z" })).toBeNull();
    expect(activeExpiresAt({})).toBeNull();
    expect(activeExpiresAt({ expires_at: "not a date" })).toBeNull();
    expect(activeExpiresAt({ expires_at: 12345 })).toBeNull();
  });
});

describe("PAYABLE_INVOICE_STATUSES", () => {
  it("covers exactly the states a payer may act on", () => {
    expect([...PAYABLE_INVOICE_STATUSES].sort()).toEqual(["expired", "sent"]);
  });
});

describe("ensureInvoicePaymentRequest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a request from the worker's stored receiving wallet", async () => {
    const captured = serviceClient();
    mockCoinPaySuccess();

    const result = await ensureInvoicePaymentRequest(invoice(WALLET_METADATA));

    expect(result).toMatchObject({
      ok: true,
      reused: false,
      data: {
        coinpay_invoice_id: "cp-1",
        payment_address: "deposit-addr",
        amount_crypto: "0.42",
        payment_currency: "sol",
      },
    });
    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_usd: 125,
        currency: "sol",
        merchant_wallet_address: WALLET,
        expires_in: PAYMENT_REQUEST_SECONDS,
      })
    );
    expect(captured.row).toMatchObject({ status: "sent", coinpay_invoice_id: "cp-1" });
  });

  it("reuses an unexpired request without calling CoinPay again", async () => {
    serviceClient();

    const result = await ensureInvoicePaymentRequest(
      invoice(
        {
          ...WALLET_METADATA,
          payment_address: "existing-addr",
          amount_crypto: "0.9",
          payment_currency: "sol",
          expires_at: "2030-01-01T00:00:00Z",
        },
        { coinpay_invoice_id: "cp-existing" }
      )
    );

    // Two live deposit addresses for one debt is how a worker gets paid twice.
    expect(createPayment).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      reused: true,
      data: { payment_address: "existing-addr", coinpay_invoice_id: "cp-existing" },
    });
  });

  it("re-quotes once the previous request expired", async () => {
    serviceClient();
    mockCoinPaySuccess();

    const result = await ensureInvoicePaymentRequest(
      invoice(
        {
          ...WALLET_METADATA,
          payment_address: "stale-addr",
          expires_at: "2020-01-01T00:00:00Z",
        },
        { coinpay_invoice_id: "cp-old" }
      )
    );

    expect(createPayment).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, reused: false });
  });

  it("keeps the superseded payment id in history when re-quoting", async () => {
    const captured = serviceClient();
    mockCoinPaySuccess();

    await ensureInvoicePaymentRequest(
      invoice({ ...WALLET_METADATA, expires_at: "2020-01-01T00:00:00Z" }, {
        coinpay_invoice_id: "cp-old",
      })
    );

    // Funds sent late to the old address still need to be traceable.
    expect(captured.row.metadata.previous_coinpay_invoice_ids).toEqual(["cp-old"]);
  });

  it("fails cleanly when the worker has no receiving wallet", async () => {
    serviceClient();

    const result = await ensureInvoicePaymentRequest(invoice({}));

    expect(result).toMatchObject({ ok: false, code: "NO_WALLET" });
    expect(createPayment).not.toHaveBeenCalled();
  });

  it("fails when the wallet address is blank", async () => {
    serviceClient();

    const result = await ensureInvoicePaymentRequest(
      invoice({ receiver_payment_currency: "sol", merchant_wallet_address: "   " })
    );

    expect(result).toMatchObject({ ok: false, code: "NO_WALLET" });
  });

  it("reports a provider throw as a PROVIDER failure rather than escaping", async () => {
    serviceClient();
    (createPayment as any).mockRejectedValue(new Error("CoinPay is down"));

    // One bad invoice must not abort a 62-invoice bulk run.
    const result = await ensureInvoicePaymentRequest(invoice(WALLET_METADATA));

    expect(result).toMatchObject({ ok: false, code: "PROVIDER", error: "CoinPay is down" });
  });

  it("rejects a provider response with no payment id or address", async () => {
    serviceClient();

    mockCoinPaySuccess({ payment_id: null, payment: {} });
    expect(await ensureInvoicePaymentRequest(invoice(WALLET_METADATA))).toMatchObject({
      ok: false,
      code: "PROVIDER",
    });

    vi.clearAllMocks();
    serviceClient();
    mockCoinPaySuccess({ address: null, payment: { id: "cp-1" } });
    expect(await ensureInvoicePaymentRequest(invoice(WALLET_METADATA))).toMatchObject({
      ok: false,
      code: "PROVIDER",
    });
  });

  it("reports a persistence failure instead of claiming success", async () => {
    (createServiceClient as any).mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: null, error: { message: "db down" } })),
            })),
          })),
        })),
      })),
    });
    mockCoinPaySuccess();

    // A live deposit address the invoice does not know about would strand funds.
    const result = await ensureInvoicePaymentRequest(invoice(WALLET_METADATA));

    expect(result).toMatchObject({ ok: false, code: "PERSIST" });
  });

  it("defaults an absent provider expiry to the standard window", async () => {
    const captured = serviceClient();
    mockCoinPaySuccess({ expires_at: null, payment: { id: "cp-1" } });

    const before = Date.now();
    const result = await ensureInvoicePaymentRequest(invoice(WALLET_METADATA));

    expect(result.ok).toBe(true);
    const expiry = new Date(captured.row.metadata.expires_at).getTime();
    expect(expiry).toBeGreaterThanOrEqual(before + PAYMENT_REQUEST_SECONDS * 1000 - 1000);
  });

  it("carries the invoice identifiers into provider metadata for webhook matching", async () => {
    serviceClient();
    mockCoinPaySuccess();

    await ensureInvoicePaymentRequest(invoice(WALLET_METADATA));

    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          type: "gig_invoice",
          invoice_id: INVOICE_ID,
          gig_id: GIG_ID,
          platform: "ugig.net",
        }),
      })
    );
  });
});
