import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "crypto";

const mockFrom = vi.fn();
const mockSupabase = { from: mockFrom };

// Must mock service client, NOT server client
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => mockSupabase,
}));

vi.mock("@/lib/funding", () => ({
  LIFETIME_THRESHOLD_USD: 50,
  FUNDING_TIERS: {},
}));

vi.mock("@/lib/reputation-hooks", () => ({
  getUserDid: vi.fn().mockResolvedValue(null),
  onPaymentReceived: vi.fn().mockResolvedValue(false),
  onPaymentSent: vi.fn().mockResolvedValue(false),
}));

import { POST } from "./route";

const WEBHOOK_SECRET = "test_webhook_secret_123";

function signPayload(payload: Record<string, any>, secret: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const payloadString = JSON.stringify(payload);
  const signedPayload = `${ts}.${payloadString}`;
  const signature = createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `t=${ts},v1=${signature}`;
}

function makeWebhookPayload(type: string, data: Record<string, any> = {}) {
  return {
    type,
    data: {
      payment_id: "pay_test_123",
      amount_usd: 1,
      status: "confirmed",
      ...data,
    },
    timestamp: new Date().toISOString(),
  };
}

function makeRequest(payload: Record<string, any>, secret: string): NextRequest {
  const body = JSON.stringify(payload);
  const sig = signPayload(payload, secret);
  return new NextRequest("http://localhost/api/payments/coinpayportal/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CoinPay-Signature": sig,
    },
    body,
  });
}

function chainResult(result: { data: any; error: any }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ["select", "eq", "single", "insert", "update", "delete", "in", "order", "limit"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue(result);
  chain.insert = vi.fn().mockResolvedValue(result);
  return chain;
}

describe("POST /api/payments/coinpayportal/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COINPAY_FUNDING_WEBHOOK_SECRET = WEBHOOK_SECRET;
    delete process.env.COINPAY_WEBHOOK_SECRET;
  });

  it("returns 401 without signature", async () => {
    const req = new NextRequest("http://localhost/api/payments/coinpayportal/webhook", {
      method: "POST",
      body: JSON.stringify({ type: "test" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 with invalid signature", async () => {
    const payload = makeWebhookPayload("payment.confirmed");
    const body = JSON.stringify(payload);
    const req = new NextRequest("http://localhost/api/payments/coinpayportal/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CoinPay-Signature": "t=123,v1=invalidsig",
      },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 500 when webhook secret not configured", async () => {
    delete process.env.COINPAY_FUNDING_WEBHOOK_SECRET;
    const req = new NextRequest("http://localhost/api/payments/coinpayportal/webhook", {
      method: "POST",
      headers: { "X-CoinPay-Signature": "t=1,v1=abc" },
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it("processes payment.confirmed webhook", async () => {
    const payload = makeWebhookPayload("payment.confirmed", {
      payment_id: "pay_123",
      amount_usd: 1,
      status: "confirmed",
    });

    const paymentChain = chainResult({
      data: { id: "local-1", user_id: "user-1", type: "tip", amount_usd: 1 },
      error: null,
    });
    const updateChain = chainResult({ data: null, error: null });
    const notifChain = chainResult({ data: null, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "payments") return paymentChain;
      if (table === "notifications") return notifChain;
      return updateChain;
    });

    const req = makeRequest(payload, WEBHOOK_SECRET);
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.received).toBe(true);
  });

  it("accepts the primary CoinPay business webhook secret", async () => {
    process.env.COINPAY_WEBHOOK_SECRET = "business_webhook_secret";
    process.env.COINPAY_FUNDING_WEBHOOK_SECRET = "wrong_funding_secret";

    const payload = makeWebhookPayload("payment.confirmed", {
      payment_id: "pay_123",
      amount_usd: 1,
      status: "confirmed",
    });

    const paymentChain = chainResult({
      data: { id: "local-1", user_id: "user-1", type: "tip", amount_usd: 1 },
      error: null,
    });
    const okChain = chainResult({ data: null, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "payments") return paymentChain;
      return okChain;
    });

    const req = makeRequest(payload, "business_webhook_secret");
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("marks gig invoices paid when webhook payment is not in payments", async () => {
    const payload = makeWebhookPayload("payment.confirmed", {
      payment_id: "cp-pay-invoice-1",
      amount_usd: 3,
      amount_crypto: 0.02,
      currency: "SOL",
      status: "confirmed",
    });

    const missingPaymentChain = chainResult({
      data: null,
      error: { code: "PGRST116", message: "No rows" },
    });
    const invoiceChain = chainResult({
      data: {
        id: "local-inv-1",
        gig_id: "gig-1",
        application_id: "app-1",
        worker_id: "worker-1",
        poster_id: "poster-1",
        amount_usd: 3,
        status: "sent",
        metadata: { payment_address: "SolAddress" },
      },
      error: null,
    });
    const gigChain = chainResult({ data: { title: "Invoice fix" }, error: null });
    const okChain = chainResult({ data: null, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "payments") return missingPaymentChain;
      if (table === "gig_invoices") return invoiceChain;
      if (table === "gigs") return gigChain;
      return okChain;
    });

    const req = makeRequest(payload, WEBHOOK_SECRET);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith("gig_invoices");
    expect(invoiceChain.update).toHaveBeenCalledWith(expect.objectContaining({ status: "paid" }));
  });

  it("marks bounty submissions paid when webhook payment is not in payments or gig invoices", async () => {
    const payload = makeWebhookPayload("payment.confirmed", {
      payment_id: "cp-pay-bounty-1",
      amount_usd: 25,
      amount_crypto: 0.5,
      currency: "SOL",
      tx_hash: "tx-1",
      status: "confirmed",
    });

    const missingPaymentChain = chainResult({
      data: null,
      error: { code: "PGRST116", message: "No rows" },
    });
    const missingInvoiceChain = chainResult({
      data: null,
      error: { code: "PGRST116", message: "No rows" },
    });
    const bountySubmissionChain = chainResult({
      data: {
        id: "sub-1",
        bounty_id: "bounty-1",
        submitter_id: "worker-1",
        metadata: { payment_address: "SolAddress" },
      },
      error: null,
    });
    const bountyChain = chainResult({
      data: { id: "bounty-1", title: "Bounty fix", creator_id: "poster-1", payout_usd: 25 },
      error: null,
    });
    const okChain = chainResult({ data: null, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "payments") return missingPaymentChain;
      if (table === "gig_invoices") return missingInvoiceChain;
      if (table === "bounty_submissions") return bountySubmissionChain;
      if (table === "bounties") return bountyChain;
      return okChain;
    });

    const req = makeRequest(payload, WEBHOOK_SECRET);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith("bounty_submissions");
    expect(bountySubmissionChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        payout_status: "paid",
        metadata: expect.objectContaining({
          tx_hash: "tx-1",
          amount_crypto: 0.5,
          payment_currency: "SOL",
        }),
      })
    );
  });

  it("resets bounty submissions when payment expires so the creator can retry", async () => {
    const payload = makeWebhookPayload("payment.expired", {
      payment_id: "cp-pay-bounty-expired",
      amount_usd: 25,
      amount_crypto: 0.5,
      currency: "SOL",
      status: "expired",
    });

    const missingPaymentChain = chainResult({ data: null, error: null });
    const missingInvoiceChain = chainResult({
      data: null,
      error: { code: "PGRST116", message: "No rows" },
    });
    const bountySubmissionChain = chainResult({
      data: {
        id: "sub-1",
        bounty_id: "bounty-1",
        submitter_id: "worker-1",
        coinpay_invoice_id: "cp-pay-bounty-expired",
        metadata: { payment_address: "SolAddress" },
      },
      error: null,
    });
    const bountyChain = chainResult({
      data: { title: "Bounty fix", creator_id: "poster-1" },
      error: null,
    });
    const okChain = chainResult({ data: null, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "payments") return missingPaymentChain;
      if (table === "gig_invoices") return missingInvoiceChain;
      if (table === "bounty_submissions") return bountySubmissionChain;
      if (table === "bounties") return bountyChain;
      return okChain;
    });

    const req = makeRequest(payload, WEBHOOK_SECRET);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(bountySubmissionChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        payout_status: "unpaid",
        coinpay_invoice_id: null,
        pay_url: null,
        metadata: expect.objectContaining({
          expired_coinpay_invoice_id: "cp-pay-bounty-expired",
        }),
      })
    );
  });

  it("processes payment.forwarded webhook", async () => {
    const payload = makeWebhookPayload("payment.forwarded", {
      payment_id: "pay_456",
      tx_hash: "abc123",
      merchant_tx_hash: "def456",
    });

    const chain = chainResult({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const req = makeRequest(payload, WEBHOOK_SECRET);
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("payment.forwarded settles an unpaid gig invoice to paid and records the merchant_tx_hash", async () => {
    const payload = makeWebhookPayload("payment.forwarded", {
      payment_id: "cp-inv-1",
      tx_hash: "abc123",
      merchant_tx_hash: "def456",
      currency: "usdc_sol",
      amount_crypto: "0.5",
    });

    const gigInvoiceChain = chainResult({
      data: {
        id: "inv-1",
        status: "sent",
        application_id: "app-1",
        gig_id: "gig-1",
        worker_id: "worker-1",
        poster_id: "poster-1",
        amount_usd: 10,
        metadata: { merchant_wallet_address: "WorkerWallet" },
      },
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "gig_invoices") return gigInvoiceChain;
      return chainResult({ data: null, error: null });
    });

    const res = await POST(makeRequest(payload, WEBHOOK_SECRET));
    expect(res.status).toBe(200);
    // It must flip the invoice to paid (not revert to "sent") and store proof.
    expect(gigInvoiceChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "paid",
        metadata: expect.objectContaining({ merchant_tx_hash: "def456" }),
      })
    );
  });

  it("payment.forwarded is idempotent on an already-paid invoice (records proof, no duplicate side-effects)", async () => {
    const payload = makeWebhookPayload("payment.forwarded", {
      payment_id: "cp-inv-2",
      tx_hash: "abc123",
      merchant_tx_hash: "def456",
    });

    const gigInvoiceChain = chainResult({
      data: {
        id: "inv-2",
        status: "paid",
        application_id: "app-2",
        gig_id: "gig-2",
        worker_id: "worker-2",
        poster_id: "poster-2",
        amount_usd: 10,
        metadata: { paid_at: "2026-05-30T00:00:00Z" },
      },
      error: null,
    });
    const notifChain = chainResult({ data: null, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "gig_invoices") return gigInvoiceChain;
      if (table === "notifications") return notifChain;
      return chainResult({ data: null, error: null });
    });

    const res = await POST(makeRequest(payload, WEBHOOK_SECRET));
    expect(res.status).toBe(200);
    // Records the forward proof...
    expect(gigInvoiceChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ merchant_tx_hash: "def456" }),
      })
    );
    // ...but does NOT re-flip status or re-notify.
    expect(gigInvoiceChain.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "paid" })
    );
    expect(notifChain.insert).not.toHaveBeenCalled();
  });

  it("payment.forwarded does not revive a cancelled invoice into paid", async () => {
    const payload = makeWebhookPayload("payment.forwarded", {
      payment_id: "cp-inv-cancelled",
      tx_hash: "abc123",
      merchant_tx_hash: "def456",
      currency: "usdc_sol",
      amount_crypto: "0.5",
    });

    const gigInvoiceChain = chainResult({
      data: {
        id: "inv-cancelled",
        status: "cancelled",
        application_id: "app-cancelled",
        gig_id: "gig-cancelled",
        worker_id: "worker-cancelled",
        poster_id: "poster-cancelled",
        amount_usd: 10,
        metadata: { cancelled_at: "2026-07-08T00:00:00Z" },
      },
      error: null,
    });
    const appChain = chainResult({ data: null, error: null });
    const notifChain = chainResult({ data: null, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "gig_invoices") return gigInvoiceChain;
      if (table === "applications") return appChain;
      if (table === "notifications") return notifChain;
      return chainResult({ data: null, error: null });
    });

    const res = await POST(makeRequest(payload, WEBHOOK_SECRET));
    expect(res.status).toBe(200);
    expect(gigInvoiceChain.update).not.toHaveBeenCalled();
    expect(appChain.update).not.toHaveBeenCalled();
    expect(notifChain.insert).not.toHaveBeenCalled();
  });

  it("uses service client (not cookie-based auth)", async () => {
    // This test verifies the fix: service client is used for webhooks
    // The mock is set up for createServiceClient, not createClient
    // If the code used createClient, the mock wouldn't work and tests would fail
    const payload = makeWebhookPayload("payment.confirmed");
    const chain = chainResult({
      data: { id: "local-1", user_id: "user-1", type: "tip", amount_usd: 1 },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const req = makeRequest(payload, WEBHOOK_SECRET);
    const res = await POST(req);
    expect(res.status).toBe(200);
    // If createClient was used instead of createServiceClient, mockFrom would never be called
    expect(mockFrom).toHaveBeenCalled();
  });
});
