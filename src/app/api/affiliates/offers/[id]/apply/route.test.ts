import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getRateLimitIdentifier: () => "rate-key",
  rateLimitExceeded: () => new Response("rate limited", { status: 429 }),
}));

vi.mock("@/lib/affiliates/tracking", () => ({
  generateTrackingCode: () => "alice-test123",
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

function makeRequest() {
  return new NextRequest("http://localhost/api/affiliates/offers/offer-1/apply", {
    method: "POST",
    body: "{}",
  });
}

function makeParams(id = "offer-1") {
  return { params: Promise.resolve({ id }) };
}

function makeSingleResponse(data: unknown) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data, error: null }),
        }),
        single: () => Promise.resolve({ data, error: null }),
      }),
    }),
  };
}

describe("POST /api/affiliates/offers/[id]/apply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    mockGetAuthContext.mockResolvedValue({
      user: { id: "affiliate-1", authMethod: "session" },
    });
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("returns the existing tracking URL when an approved affiliate reapplies", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "affiliate_offers") {
        return makeSingleResponse({
          id: "offer-1",
          seller_id: "seller-1",
          status: "active",
          slug: "test-offer",
        });
      }

      if (table === "affiliate_applications") {
        return makeSingleResponse({
          id: "application-1",
          status: "approved",
          tracking_code: "alice-test123",
        });
      }

      return {};
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "Already approved",
      application: {
        id: "application-1",
        status: "approved",
        tracking_code: "alice-test123",
      },
      tracking_code: "alice-test123",
      tracking_url: "https://ugig.net/ref/alice-test123",
    });
  });
});
