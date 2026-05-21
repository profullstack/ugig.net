import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

const mockGetUserLnWallet = vi.fn();
const mockInternalTransfer = vi.fn();
vi.mock("@/lib/lightning/wallet-utils", () => ({
  getUserLnWallet: (...args: unknown[]) => mockGetUserLnWallet(...args),
  internalTransfer: (...args: unknown[]) => mockInternalTransfer(...args),
}));

import { POST } from "./route";

function makeRawPostRequest(id: string, body: string) {
  return new NextRequest(
    `http://localhost/api/affiliates/offers/${id}/conversions/pay`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }
  );
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeOfferQuery(sellerId: string) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    single: vi.fn().mockResolvedValue({
      data: { id: "offer-1", seller_id: sellerId },
      error: null,
    }),
  };
  return query;
}

describe("POST /api/affiliates/offers/[id]/conversions/pay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for malformed JSON before running payout logic", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "affiliate_offers") {
        return makeOfferQuery("seller-1");
      }
      throw new Error(`Unexpected table query: ${table}`);
    });

    const res = await POST(makeRawPostRequest("offer-1", "{"), makeParams("offer-1"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("conversion_id is required");
    expect(mockFrom).not.toHaveBeenCalledWith("affiliate_conversions");
    expect(mockGetUserLnWallet).not.toHaveBeenCalled();
    expect(mockInternalTransfer).not.toHaveBeenCalled();
  });
});
