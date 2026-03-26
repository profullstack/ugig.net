import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

const mockFrom = vi.fn();
const supabaseClient = { from: mockFrom };

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => supabaseClient),
}));

const mockCheckPayment = vi.fn();
vi.mock("@/lib/lnbits", () => ({
  checkPayment: (...args: unknown[]) => mockCheckPayment(...args),
}));

import { POST } from "./route";

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/funding/lnbits-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockPaymentLookup(payment: Record<string, unknown> | null) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of [
    "select",
    "insert",
    "update",
    "eq",
    "single",
    "order",
    "in",
  ]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue({
    data: payment,
    error: payment ? null : { message: "not found" },
  });
  return chain;
}

// ── Tests ──────────────────────────────────────────────────────────

describe("POST /api/funding/lnbits-webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckPayment.mockResolvedValue({ paid: true });
  });

  it("returns 400 if no payment_hash", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 404 if payment not found in DB", async () => {
    mockFrom.mockReturnValue(mockPaymentLookup(null));
    const res = await POST(makeRequest({ payment_hash: "unknown" }));
    expect(res.status).toBe(404);
  });

  it("returns ok if payment already paid (idempotent)", async () => {
    mockFrom.mockReturnValue(
      mockPaymentLookup({
        id: "pay-1",
        user_id: "user-1",
        payment_hash: "hash123",
        tier: "credits_100k",
        amount_sats: 100000,
        amount_usd: 100,
        status: "paid",
      })
    );
    const res = await POST(makeRequest({ payment_hash: "hash123" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBe("Already processed");
  });

  it("returns 402 if LNbits says not paid", async () => {
    mockCheckPayment.mockResolvedValue({ paid: false });
    const pendingPayment = {
      id: "pay-1",
      user_id: "user-1",
      payment_hash: "hash123",
      tier: "credits_100k",
      amount_sats: 100000,
      amount_usd: 100,
      status: "pending",
    };

    const selectChain = mockPaymentLookup(pendingPayment);
    mockFrom.mockReturnValue(selectChain);

    const res = await POST(makeRequest({ payment_hash: "hash123" }));
    expect(res.status).toBe(402);
  });

  it("processes payment and applies credits reward", async () => {
    const pendingPayment = {
      id: "pay-1",
      user_id: "user-1",
      payment_hash: "hash123",
      tier: "credits_100k",
      amount_sats: 100000,
      amount_usd: 100,
      status: "pending",
    };

    // Build chains for each .from() call
    const chains: ReturnType<typeof mockPaymentLookup>[] = [];

    // 1st call: select funding_payments (lookup)
    chains.push(mockPaymentLookup(pendingPayment));
    // 2nd call: update funding_payments (mark paid)
    const updateChain = mockPaymentLookup(null);
    updateChain.update = vi.fn().mockReturnValue(updateChain);
    updateChain.eq = vi
      .fn()
      .mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    chains.push(updateChain);
    // 3rd call: select profiles (get credits)
    chains.push(
      mockPaymentLookup({ credits: 0 })
    );
    // 4th call: update profiles (add credits)
    const profileUpdate = mockPaymentLookup(null);
    profileUpdate.update = vi.fn().mockReturnValue(profileUpdate);
    profileUpdate.eq = vi.fn().mockResolvedValue({ error: null });
    chains.push(profileUpdate);
    // 5th call: select subscriptions (check for lifetime)
    chains.push(mockPaymentLookup(null));
    // 6th call: insert subscription (lifetime)
    const subInsert = mockPaymentLookup(null);
    subInsert.insert = vi.fn().mockResolvedValue({ error: null });
    chains.push(subInsert);
    // 7th call: insert rewards log
    const rewardsInsert = mockPaymentLookup(null);
    rewardsInsert.insert = vi.fn().mockResolvedValue({ error: null });
    chains.push(rewardsInsert);

    let callIdx = 0;
    mockFrom.mockImplementation(() => chains[callIdx++] || chains[0]);

    const res = await POST(makeRequest({ payment_hash: "hash123" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("grants lifetime premium for $50+ contributions", async () => {
    const pendingPayment = {
      id: "pay-2",
      user_id: "user-2",
      payment_hash: "hash456",
      tier: "lifetime",
      amount_sats: 200000,
      amount_usd: 55,
      status: "pending",
    };

    const chains: ReturnType<typeof mockPaymentLookup>[] = [];
    chains.push(mockPaymentLookup(pendingPayment));

    const updateChain = mockPaymentLookup(null);
    updateChain.update = vi.fn().mockReturnValue(updateChain);
    updateChain.eq = vi
      .fn()
      .mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    chains.push(updateChain);

    // subscriptions lookup
    chains.push(mockPaymentLookup(null));
    // subscriptions insert (lifetime)
    const subInsert = mockPaymentLookup(null);
    subInsert.insert = vi.fn().mockResolvedValue({ error: null });
    chains.push(subInsert);
    // rewards log insert
    const rewardsInsert = mockPaymentLookup(null);
    rewardsInsert.insert = vi.fn().mockResolvedValue({ error: null });
    chains.push(rewardsInsert);

    let callIdx = 0;
    mockFrom.mockImplementation(() => chains[callIdx++] || chains[0]);

    const res = await POST(makeRequest({ payment_hash: "hash456" }));
    expect(res.status).toBe(200);
    // Verify subscription was created/updated for lifetime
    expect(mockFrom).toHaveBeenCalledWith("subscriptions");
  });
});
