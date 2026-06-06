import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
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

function makePostRequest(id: string, body: Record<string, unknown>) {
  return new NextRequest(
    `http://localhost/api/affiliates/offers/${id}/conversions/pay`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function chainable(data: unknown, error: unknown = null) {
  const obj: Record<string, unknown> = { data, error };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === "then") return undefined;
      if (prop === "data") return data;
      if (prop === "error") return error;
      return () => new Proxy(obj, handler);
    },
  };
  return new Proxy(obj, handler);
}

describe("POST /api/affiliates/offers/[id]/conversions/pay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-string conversion_id before querying conversions (#422)", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "affiliate_offers") {
        return chainable({
          id: "offer-1",
          seller_id: "seller-1",
        });
      }
      return chainable(null);
    });

    const res = await POST(
      makePostRequest("offer-1", { conversion_id: { id: "conv-1" } }),
      makeParams("offer-1")
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "conversion_id must be a non-empty string",
    });
    expect(mockFrom).not.toHaveBeenCalledWith("affiliate_conversions");
    expect(mockGetUserLnWallet).not.toHaveBeenCalled();
    expect(mockInternalTransfer).not.toHaveBeenCalled();
  });

  it("rejects pending conversions before their settlement date", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "affiliate_offers") {
        return chainable({
          id: "offer-1",
          seller_id: "seller-1",
        });
      }
      if (table === "affiliate_conversions") {
        return chainable({
          id: "conv-1",
          affiliate_id: "affiliate-1",
          commission_sats: 500,
          status: "pending",
          settles_at: "2999-01-01T00:00:00.000Z",
        });
      }
      return chainable(null);
    });

    const res = await POST(
      makePostRequest("offer-1", { conversion_id: "conv-1" }),
      makeParams("offer-1")
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Conversion has not settled yet",
    });
    expect(mockGetUserLnWallet).not.toHaveBeenCalled();
    expect(mockInternalTransfer).not.toHaveBeenCalled();
  });
});
