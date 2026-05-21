import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

const mockRecordClick = vi.fn();
vi.mock("@/lib/affiliates/tracking", () => ({
  recordClick: (...args: unknown[]) => mockRecordClick(...args),
}));

function makeRequest(ref = "alice-abc123") {
  return new NextRequest(`https://ugig.net/api/affiliates/click?ugig_ref=${ref}`, {
    headers: {
      cookie: "ugig_visitor=visitor-1",
    },
  });
}

function chainable(data: unknown, error: unknown = null) {
  const result = { data, error };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === "then") return undefined;
      if (prop === "data") return data;
      if (prop === "error") return error;
      return () => new Proxy(result, handler);
    },
  };
  return new Proxy(result, handler);
}

describe("GET /api/affiliates/click", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("still redirects to the offer when click tracking fails", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "affiliate_applications") {
        return chainable({
          offer_id: "offer-1",
          affiliate_offers: {
            product_url: "https://example.com/product",
            slug: "test-offer",
            listing_id: null,
            cookie_days: 30,
            skill_listings: null,
          },
        });
      }
      return chainable(null);
    });
    mockRecordClick.mockRejectedValue(new Error("click insert failed"));
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const res = await GET(makeRequest());

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("https://example.com/product");
      expect(mockRecordClick).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          trackingCode: "alice-abc123",
          visitorId: "visitor-1",
        })
      );
      expect(consoleWarn).toHaveBeenCalledWith(
        "Failed to record affiliate click",
        expect.any(Error)
      );
    } finally {
      consoleWarn.mockRestore();
    }
  });
});
