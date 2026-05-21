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

const mockGenerateTrackingCode = vi.fn();
vi.mock("@/lib/affiliates/tracking", () => ({
  generateTrackingCode: (...args: unknown[]) => mockGenerateTrackingCode(...args),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

function makeRequest(body: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/affiliates/offers/offer-1/apply", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function makeParams(id = "offer-1") {
  return { params: Promise.resolve({ id }) };
}

function makeOfferQuery() {
  return {
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({
          data: {
            id: "offer-1",
            seller_id: "seller-1",
            status: "active",
            slug: "test-offer",
            total_affiliates: 0,
          },
          error: null,
        }),
      }),
    }),
    update: () => ({
      eq: () => Promise.resolve({ data: null, error: null }),
    }),
  };
}

describe("POST /api/affiliates/offers/[id]/apply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    mockGenerateTrackingCode.mockReturnValue("alice-test123");
  });

  it("rejects non-string notes before creating an application", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "affiliate-1", authMethod: "session" },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "affiliate_offers") {
        return makeOfferQuery();
      }
      if (table === "affiliate_applications") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
          insert: vi.fn(),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { username: "alice" }, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    const res = await POST(makeRequest({ note: { text: "hello" } }), makeParams());

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "note must be a string" });
  });

  it("trims string notes and stores blank notes as null", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "affiliate-1", authMethod: "session" },
    });

    const insert = vi.fn().mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({
          data: { id: "application-1" },
          error: null,
        }),
      }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "affiliate_offers") {
        return makeOfferQuery();
      }
      if (table === "affiliate_applications") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
          insert,
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { username: "alice" }, error: null }),
            }),
          }),
        };
      }
      if (table === "notifications") {
        return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
      }
      return {};
    });

    const res = await POST(makeRequest({ note: "   " }), makeParams());

    expect(res.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        note: null,
        tracking_code: "alice-test123",
      })
    );
  });
});
