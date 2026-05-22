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

import { POST } from "./route";

const WEBHOOK_SECRET = "test_webhook_secret_123";

function signPayload(payload: Record<string, any>, secret: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const payloadString = JSON.stringify(payload);
  const signedPayload = `${ts}.${payloadString}`;
  const signature = createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");
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
    process.env.COINPAY_UGIG_CRYPTO_WEBHOOK_SECRET = WEBHOOK_SECRET;
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
    delete process.env.COINPAY_UGIG_CRYPTO_WEBHOOK_SECRET;
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

    const paymentChain = chainResult({ data: { id: "local-1", user_id: "user-1", type: "tip", amount_usd: 1 }, error: null });
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
    expect(invoiceChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "paid" })
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

  it("uses service client (not cookie-based auth)", async () => {
    // This test verifies the fix: service client is used for webhooks
    // The mock is set up for createServiceClient, not createClient
    // If the code used createClient, the mock wouldn't work and tests would fail
    const payload = makeWebhookPayload("payment.confirmed");
    const chain = chainResult({ data: { id: "local-1", user_id: "user-1", type: "tip", amount_usd: 1 }, error: null });
    mockFrom.mockReturnValue(chain);

    const req = makeRequest(payload, WEBHOOK_SECRET);
    const res = await POST(req);
    expect(res.status).toBe(200);
    // If createClient was used instead of createServiceClient, mockFrom would never be called
    expect(mockFrom).toHaveBeenCalled();
  });
});
