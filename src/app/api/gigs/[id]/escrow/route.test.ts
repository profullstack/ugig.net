import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/coinpayportal", () => ({
  createEscrow: vi.fn(),
  SUPPORTED_CURRENCIES: {
    usdc_sol: { name: "USDC (Solana)", symbol: "USDC" },
    sol: { name: "Solana", symbol: "SOL" },
  },
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

import { GET, POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";
import { createEscrow } from "@/lib/coinpayportal";

const GIG_ID = "8489a861-0999-4107-afca-2592021ac338";
const APP_ID = "d2317730-c56a-49e9-a6e4-dc469b7605f7";
const POSTER_ID = "4f16c625-c37a-4654-82db-e391067cbb13";
const WORKER_ID = "666cbaba-c6ea-4756-ad44-d6a5b4248f8f";
const DEPOSITOR_ADDR = "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV";
const BENEFICIARY_ADDR = "FxkPpN3NiQzR9Bp6YKL1dPwGjPump7EcDhSYGxXyscz";

function req(body?: unknown) {
  return { json: () => Promise.resolve(body) } as any;
}
const params = { params: Promise.resolve({ id: GIG_ID }) };

function mockSupabase(overrides: Record<string, any> = {}) {
  const defaultChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return {
    from: vi.fn((table: string) => {
      if (overrides[table]) return overrides[table];
      return { ...defaultChain };
    }),
    ...overrides._root,
  };
}

describe("GET /api/gigs/[id]/escrow", () => {
  it("returns 401 if not authenticated", async () => {
    (getAuthContext as any).mockResolvedValue(null);
    const res = await GET(req(), params);
    expect(res.status).toBe(401);
  });

  it("returns escrows for authenticated user", async () => {
    const escrows = [{ id: "esc-1", status: "funded" }];
    const sb = mockSupabase({
      gig_escrows: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: escrows, error: null }),
      },
    });
    (getAuthContext as any).mockResolvedValue({ user: { id: POSTER_ID }, supabase: sb });
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe("esc-1");
  });
});

describe("POST /api/gigs/[id]/escrow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 if not authenticated", async () => {
    (getAuthContext as any).mockResolvedValue(null);
    const res = await POST(req({ application_id: APP_ID, currency: "sol", depositor_address: DEPOSITOR_ADDR, beneficiary_address: BENEFICIARY_ADDR }), params);
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing application_id", async () => {
    (getAuthContext as any).mockResolvedValue({ user: { id: "u1" }, supabase: {} });
    const res = await POST(req({ currency: "sol", depositor_address: DEPOSITOR_ADDR, beneficiary_address: BENEFICIARY_ADDR }), params);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid currency", async () => {
    (getAuthContext as any).mockResolvedValue({ user: { id: "u1" }, supabase: {} });
    const res = await POST(req({ application_id: APP_ID, currency: "dogecoin", depositor_address: DEPOSITOR_ADDR, beneficiary_address: BENEFICIARY_ADDR }), params);
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-uuid application_id", async () => {
    (getAuthContext as any).mockResolvedValue({ user: { id: "u1" }, supabase: {} });
    const res = await POST(req({ application_id: "not-a-uuid", currency: "sol", depositor_address: DEPOSITOR_ADDR, beneficiary_address: BENEFICIARY_ADDR }), params);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing depositor_address", async () => {
    (getAuthContext as any).mockResolvedValue({ user: { id: "u1" }, supabase: {} });
    const res = await POST(req({ application_id: APP_ID, currency: "sol", beneficiary_address: BENEFICIARY_ADDR }), params);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing beneficiary_address", async () => {
    (getAuthContext as any).mockResolvedValue({ user: { id: "u1" }, supabase: {} });
    const res = await POST(req({ application_id: APP_ID, currency: "sol", depositor_address: DEPOSITOR_ADDR }), params);
    expect(res.status).toBe(400);
  });

  it("returns 400 for short depositor_address", async () => {
    (getAuthContext as any).mockResolvedValue({ user: { id: "u1" }, supabase: {} });
    const res = await POST(req({ application_id: APP_ID, currency: "sol", depositor_address: "short", beneficiary_address: BENEFICIARY_ADDR }), params);
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
    (getAuthContext as any).mockResolvedValue({ user: { id: POSTER_ID }, supabase: sb });
    const res = await POST(req({ application_id: APP_ID, currency: "sol", depositor_address: DEPOSITOR_ADDR, beneficiary_address: BENEFICIARY_ADDR }), params);
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not the gig poster", async () => {
    const sb = mockSupabase({
      gigs: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: GIG_ID, title: "Test Gig", poster_id: "someone-else", budget_min: 100 },
          error: null,
        }),
      },
    });
    (getAuthContext as any).mockResolvedValue({ user: { id: POSTER_ID }, supabase: sb });
    const res = await POST(req({ application_id: APP_ID, currency: "sol", depositor_address: DEPOSITOR_ADDR, beneficiary_address: BENEFICIARY_ADDR }), params);
    expect(res.status).toBe(403);
  });

  it("creates escrow successfully with wallet addresses", async () => {
    const gig = { id: GIG_ID, title: "Test Gig", poster_id: POSTER_ID, budget_min: 100, budget_max: 200, budget_type: "fixed" };
    const application = { id: APP_ID, applicant_id: WORKER_ID, status: "accepted", proposed_rate: 150 };
    const escrowRecord = { id: "local-esc-1" };

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
      gig_escrows: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: escrowRecord, error: null }),
          }),
        }),
      },
      profiles: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { username: "testuser" }, error: null }),
      },
      notifications: {
        insert: vi.fn().mockResolvedValue({ error: null }),
      },
    });

    (getAuthContext as any).mockResolvedValue({ user: { id: POSTER_ID }, supabase: sb });
    (createEscrow as any).mockResolvedValue({
      success: true,
      escrow: {
        id: "cp-esc-1",
        escrow_address: "EscrowAddr123456789012345678",
        expires_at: "2026-04-01T00:00:00Z",
      },
    });

    const res = await POST(
      req({
        application_id: APP_ID,
        currency: "sol",
        depositor_address: DEPOSITOR_ADDR,
        beneficiary_address: BENEFICIARY_ADDR,
      }),
      params
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.payment_address).toBe("EscrowAddr123456789012345678");
    expect(body.data.amount_usd).toBe(150); // proposed_rate
    expect(body.data.platform_fee_usd).toBe(7.5); // 5% of 150

    // Verify createEscrow was called with addresses
    expect(createEscrow).toHaveBeenCalledWith(
      expect.objectContaining({
        depositor_address: DEPOSITOR_ADDR,
        beneficiary_address: BENEFICIARY_ADDR,
        currency: "sol",
        amount_usd: 150,
      })
    );
  });
});
