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

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  rateLimitExceeded: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => "affiliate-apply-test"),
}));

vi.mock("@/lib/affiliates/tracking", () => ({
  generateTrackingCode: vi.fn(() => "alice-test-offer"),
}));

import { POST } from "./route";

function makeRequest(body: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/affiliates/offers/offer-1/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id = "offer-1") {
  return { params: Promise.resolve({ id }) };
}

function mockQuery(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "insert", "update", "eq", "single"]) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  return chain;
}

describe("POST /api/affiliates/offers/[id]/apply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue({
      user: { id: "affiliate-user", authMethod: "session" },
    });
  });

  it("returns the existing tracking link when the affiliate already applied", async () => {
    const tableCalls: Record<string, number> = {};

    mockFrom.mockImplementation((table: string) => {
      tableCalls[table] = (tableCalls[table] || 0) + 1;

      if (table === "affiliate_offers") {
        return mockQuery({
          data: {
            id: "offer-1",
            seller_id: "seller-user",
            status: "active",
            slug: "test-offer",
          },
          error: null,
        });
      }

      if (table === "affiliate_applications") {
        return mockQuery({
          data: {
            id: "application-1",
            status: "approved",
            tracking_code: "alice-test-offer",
          },
          error: null,
        });
      }

      return mockQuery({ data: null, error: null });
    });

    const res = await POST(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("Already approved");
    expect(body.application).toMatchObject({
      id: "application-1",
      status: "approved",
      tracking_code: "alice-test-offer",
    });
    expect(body.tracking_code).toBe("alice-test-offer");
    expect(body.tracking_url).toBe("https://ugig.net/ref/alice-test-offer");
    expect(mockFrom).not.toHaveBeenCalledWith("profiles");
    expect(mockFrom).not.toHaveBeenCalledWith("notifications");
  });

  it("still returns the approved application when seller notification insert fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const tableCalls: Record<string, number> = {};

    mockFrom.mockImplementation((table: string) => {
      tableCalls[table] = (tableCalls[table] || 0) + 1;

      if (table === "affiliate_offers" && tableCalls[table] === 1) {
        return mockQuery({
          data: {
            id: "offer-1",
            seller_id: "seller-user",
            status: "active",
            slug: "test-offer",
          },
          error: null,
        });
      }

      if (table === "affiliate_offers") {
        return mockQuery({
          data: { total_affiliates: 2 },
          error: null,
        });
      }

      if (table === "affiliate_applications" && tableCalls[table] === 1) {
        return mockQuery({ data: null, error: null });
      }

      if (table === "affiliate_applications") {
        return mockQuery({
          data: {
            id: "application-1",
            offer_id: "offer-1",
            affiliate_id: "affiliate-user",
            tracking_code: "alice-test-offer",
            status: "approved",
          },
          error: null,
        });
      }

      if (table === "profiles") {
        return mockQuery({
          data: { username: "alice" },
          error: null,
        });
      }

      if (table === "notifications") {
        return {
          insert: vi.fn().mockRejectedValue(new Error("notification write failed")),
        };
      }

      return mockQuery({ data: null, error: null });
    });

    const res = await POST(makeRequest({ note: "Interested" }), makeParams());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.application.id).toBe("application-1");
    expect(body.tracking_code).toBe("alice-test-offer");
    expect(body.tracking_url).toContain("/ref/alice-test-offer");
    expect(mockFrom).toHaveBeenCalledWith("notifications");
    expect(warnSpy).toHaveBeenCalledWith(
      "Failed to create affiliate application notification",
      expect.any(Error)
    );

    warnSpy.mockRestore();
  });
});
