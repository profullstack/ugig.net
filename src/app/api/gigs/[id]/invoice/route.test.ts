import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/coinpayportal", () => ({
  createPayment: vi.fn(),
  resolveSupportedPaymentCurrency: vi.fn(),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

import { GET, POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";
import { createPayment, resolveSupportedPaymentCurrency } from "@/lib/coinpayportal";

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
  beforeEach(() => vi.clearAllMocks());

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

  it("returns 403 when user is not the worker", async () => {
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

  it("creates invoice successfully", async () => {
    const gig = { id: GIG_ID, title: "Test Gig", poster_id: POSTER_ID, payment_coin: "SOL" };
    const application = { id: APP_ID, applicant_id: WORKER_ID, status: "accepted", proposed_rate: 150 };
    const invoiceRecord = {
      id: "local-inv-1",
      metadata: {
        payment_address: "So11111111111111111111111111111111111111112",
        amount_crypto: 0.75,
        payment_currency: "sol",
        expires_at: "2026-05-22T12:00:00Z",
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
      gig_invoices: {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: invoiceRecord, error: null }),
          }),
        }),
      },
      profiles: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { username: "testworker", full_name: "Test Worker" }, error: null }),
      },
      notifications: {
        insert: vi.fn().mockResolvedValue({ error: null }),
      },
    });

    (getAuthContext as any).mockResolvedValue({ user: { id: WORKER_ID }, supabase: sb });
    (resolveSupportedPaymentCurrency as any).mockResolvedValue("sol");
    (createPayment as any).mockResolvedValue({
      success: true,
      payment_id: "cp-pay-1",
      address: "So11111111111111111111111111111111111111112",
      amount_crypto: 0.75,
      currency: "sol",
      expires_at: "2026-05-22T12:00:00Z",
      payment: {
        id: "cp-pay-1",
        payment_address: "So11111111111111111111111111111111111111112",
      },
    });

    const res = await POST(
      req({ application_id: APP_ID, amount: 150, notes: "Work completed" }),
      params
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.invoice_id).toBe("local-inv-1");
    expect(body.data.coinpay_invoice_id).toBe("cp-pay-1");
    expect(body.data.pay_url).toBeNull();
    expect(body.data.payment_address).toBe("So11111111111111111111111111111111111111112");
    expect(body.data.payment_currency).toBe("sol");

    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_usd: 150,
        currency: "sol",
        description: "Work completed",
      })
    );
    expect(resolveSupportedPaymentCurrency).toHaveBeenCalledWith(
      "SOL",
      expect.any(Object)
    );
  });
});
