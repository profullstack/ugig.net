import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

const mockFrom = vi.fn();
const supabaseClient = { from: mockFrom };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: vi.fn(() =>
          Promise.resolve({ data: { user: { id: "user-123" } }, error: null })
        ),
      },
    })
  ),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => supabaseClient),
}));

const mockCreateInvoice = vi.fn();
vi.mock("@/lib/lnbits", () => ({
  createInvoice: (...args: unknown[]) => mockCreateInvoice(...args),
}));

import { POST, _resetRateLimit } from "./route";

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/funding/create-invoice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function chainResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ["select", "insert", "update", "eq", "single", "order"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Terminal: insert resolves
  chain.insert = vi.fn().mockResolvedValue(result);
  return chain;
}

// ── Tests ──────────────────────────────────────────────────────────

describe("POST /api/funding/create-invoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetRateLimit();
    mockCreateInvoice.mockResolvedValue({
      payment_hash: "abc123hash",
      payment_request: "lnbc1000...",
      checking_id: "chk123",
    });
    mockFrom.mockReturnValue(chainResult({ data: null, error: null }));
  });

  it("returns 400 for invalid tier", async () => {
    const res = await POST(makeRequest({ tier: "invalid_tier" }));
    expect(res.status).toBe(400);
  });

  it("creates invoice for credits_100k tier", async () => {
    const res = await POST(makeRequest({ tier: "credits_100k" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.paymentRequest).toBe("lnbc1000...");
    expect(data.paymentHash).toBe("abc123hash");
    expect(data.tier).toBe("credits_100k");
    expect(data.amountSats).toBe(100_000);
    expect(data.expiresAt).toBeDefined();
  });

  it("creates invoice for lifetime tier", async () => {
    const res = await POST(makeRequest({ tier: "lifetime" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tier).toBe("lifetime");
    expect(data.amountSats).toBe(200_000);
  });

  it("creates invoice for supporter tier", async () => {
    const res = await POST(makeRequest({ tier: "supporter" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tier).toBe("supporter");
  });

  it("calls LNbits createInvoice with correct params", async () => {
    await POST(makeRequest({ tier: "credits_500k" }));
    expect(mockCreateInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 500_000,
        memo: expect.stringContaining("500k"),
      })
    );
  });

  it("persists payment record in database", async () => {
    const res = await POST(makeRequest({ tier: "credits_100k" }));
    expect(res.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith("funding_payments");
  });
});
