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

import { GET, POST } from "./route";
import { createPayment } from "@/lib/coinpayportal";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

const GIG_ID = "8489a861-0999-4107-afca-2592021ac338";
const INVOICE_ID = "f53e4a56-3cf7-42f9-9a33-bc1cb770c4f6";
const APP_ID = "d2317730-c56a-49e9-a6e4-dc469b7605f7";
const POSTER_ID = "4f16c625-c37a-4654-82db-e391067cbb13";
const WORKER_ID = "666cbaba-c6ea-4756-ad44-d6a5b4248f8f";
const WALLET_ADDRESS = "So11111111111111111111111111111111111111112";

const params = { params: Promise.resolve({ id: GIG_ID, invoiceId: INVOICE_ID }) };

function invoiceQuery(invoice: any) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: invoice, error: null }),
  };
}

function updateQuery(updated: any, onUpdate?: (row: any) => void) {
  return {
    update: vi.fn((row: any) => {
      onUpdate?.(row);
      return {
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: updated, error: null }),
          }),
        }),
      };
    }),
  };
}

function serviceClient(updated: any, onUpdate?: (row: any) => void) {
  return {
    from: vi.fn(() => updateQuery(updated, onUpdate)),
  };
}

function payableInvoice(metadata: Record<string, unknown> = {}) {
  return {
    id: INVOICE_ID,
    gig_id: GIG_ID,
    application_id: APP_ID,
    worker_id: WORKER_ID,
    poster_id: POSTER_ID,
    amount_usd: 125,
    currency: "USD",
    status: "sent",
    coinpay_invoice_id: null,
    pay_url: null,
    notes: "Milestone 1",
    metadata,
    gig: { id: GIG_ID, title: "Build thing", payment_coin: "SOL" },
  };
}

describe("POST /api/gigs/[id]/invoice/[invoiceId]/payment-request", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a short-lived CoinPay request from the worker's stored receiving wallet", async () => {
    const invoice = payableInvoice({
      receiver_payment_currency: "sol",
      merchant_wallet_address: WALLET_ADDRESS,
      merchant_wallet_label: "Solana wallet",
    });
    const updated = {
      id: INVOICE_ID,
      metadata: {
        receiver_payment_currency: "sol",
        merchant_wallet_address: WALLET_ADDRESS,
        merchant_wallet_label: "Solana wallet",
        payment_address: WALLET_ADDRESS,
        amount_crypto: "0.42",
        payment_currency: "sol",
        expires_at: "2030-01-01T00:00:00Z",
      },
    };
    let updatePayload: any = null;

    const authSupabase = {
      from: vi.fn(() => invoiceQuery(invoice)),
    };
    const serviceSupabase = serviceClient(updated, (row) => {
      updatePayload = row;
    });

    (getAuthContext as any).mockResolvedValue({
      user: { id: POSTER_ID },
      supabase: authSupabase,
    });
    (createServiceClient as any).mockReturnValue(serviceSupabase);
    (createPayment as any).mockResolvedValue({
      payment_id: "cp-pay-now",
      address: WALLET_ADDRESS,
      amount_crypto: "0.42",
      currency: "sol",
      expires_at: "2030-01-01T00:00:00Z",
      payment: { id: "cp-pay-now" },
    });

    const res = await POST({} as any, params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.coinpay_invoice_id).toBe("cp-pay-now");
    expect(body.data.payment_address).toBe(WALLET_ADDRESS);
    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_usd: 125,
        currency: "sol",
        merchant_wallet_address: WALLET_ADDRESS,
        expires_in: 900,
        metadata: expect.objectContaining({
          type: "gig_invoice",
          invoice_id: INVOICE_ID,
          merchant_wallet_address: WALLET_ADDRESS,
        }),
      })
    );
    expect(updatePayload).toMatchObject({
      status: "sent",
      coinpay_invoice_id: "cp-pay-now",
      pay_url: null,
      metadata: expect.objectContaining({
        payment_address: WALLET_ADDRESS,
        amount_crypto: "0.42",
        payment_currency: "sol",
        receiver_payment_currency: "sol",
        merchant_wallet_address: WALLET_ADDRESS,
      }),
    });
  });

  it("rejects payment when the invoice is missing the worker receiving wallet", async () => {
    (getAuthContext as any).mockResolvedValue({
      user: { id: POSTER_ID },
      supabase: { from: vi.fn(() => invoiceQuery(payableInvoice())) },
    });
    (createServiceClient as any).mockReturnValue(serviceClient({ id: INVOICE_ID }));

    const res = await POST({} as any, params);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("This invoice is missing the worker's CoinPay receiving wallet");
    expect(createPayment).not.toHaveBeenCalled();
  });

  it("does not create a payment request for a rejected invoice", async () => {
    const invoice = {
      ...payableInvoice({
        receiver_payment_currency: "sol",
        merchant_wallet_address: WALLET_ADDRESS,
      }),
      status: "rejected",
    };

    (getAuthContext as any).mockResolvedValue({
      user: { id: POSTER_ID },
      supabase: { from: vi.fn(() => invoiceQuery(invoice)) },
    });
    (createServiceClient as any).mockReturnValue(serviceClient({ id: INVOICE_ID }));

    const res = await POST({} as any, params);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invoice is not payable");
    expect(createPayment).not.toHaveBeenCalled();
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("returns the invoice receiving wallet metadata", async () => {
    const invoice = payableInvoice({
      receiver_payment_currency: "sol",
      merchant_wallet_address: WALLET_ADDRESS,
      merchant_wallet_label: "Solana wallet",
    });

    (getAuthContext as any).mockResolvedValue({
      user: { id: POSTER_ID },
      supabase: { from: vi.fn(() => invoiceQuery(invoice)) },
    });

    const res = await GET({} as any, params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({
      receiver_payment_currency: "sol",
      merchant_wallet_address: WALLET_ADDRESS,
      merchant_wallet_label: "Solana wallet",
    });
  });
});
