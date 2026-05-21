import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";

// Mock auth
const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

// Mock supabase service client
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

function makeRequest(id: string, origin = "http://localhost") {
  return new NextRequest(
    `${origin}/api/affiliates/offers/${id}/affiliates`
  );
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// Helper to build chainable query mock
function chainable(data: unknown, error: unknown = null) {
  const obj: Record<string, unknown> = {
    data,
    error,
  };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === "then") return undefined; // not a thenable
      if (prop === "data") return data;
      if (prop === "error") return error;
      // For terminal methods that return the result
      return (..._args: unknown[]) => new Proxy({ data, error }, handler);
    },
  };
  return new Proxy(obj, handler);
}

describe("GET /api/affiliates/offers/[id]/affiliates", () => {
  let originalAppUrl: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  });

  it("returns 401 for unauthenticated requests", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await GET(makeRequest("offer-1"), makeParams("offer-1"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 for non-owner", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-other", authMethod: "session" },
    });

    // Offer exists but belongs to someone else
    mockFrom.mockImplementation((table: string) => {
      if (table === "affiliate_offers") {
        return chainable({
          id: "offer-1",
          seller_id: "user-seller",
          title: "Test Offer",
          slug: "test",
          status: "active",
          commission_rate: 0.1,
          commission_type: "percentage",
          commission_flat_sats: 0,
          total_clicks: 0,
          total_conversions: 0,
          total_revenue_sats: 0,
          total_commissions_sats: 0,
        });
      }
      return chainable([]);
    });

    const res = await GET(makeRequest("offer-1"), makeParams("offer-1"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Not authorized");
  });

  it("returns affiliate list with stats for owner", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://ugig.net";
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-seller", authMethod: "session" },
    });

    const callTracker: Record<string, number> = {};
    mockFrom.mockImplementation((table: string) => {
      callTracker[table] = (callTracker[table] || 0) + 1;

      if (table === "affiliate_offers") {
        return chainable({
          id: "offer-1",
          seller_id: "user-seller",
          title: "Test Offer",
          slug: "test-offer",
          status: "active",
          commission_rate: 0.1,
          commission_type: "percentage",
          commission_flat_sats: 0,
          total_clicks: 50,
          total_conversions: 5,
          total_revenue_sats: 10000,
          total_commissions_sats: 1000,
        });
      }

      if (table === "affiliate_applications") {
        return chainable([
          {
            id: "app-1",
            affiliate_id: "aff-1",
            status: "approved",
            tracking_code: "alice-abc123",
            created_at: "2026-01-15T00:00:00Z",
            approved_at: "2026-01-16T00:00:00Z",
            profiles: { username: "alice", avatar_url: null },
          },
          {
            id: "app-2",
            affiliate_id: "aff-2",
            status: "pending",
            tracking_code: "bob-def456",
            created_at: "2026-02-01T00:00:00Z",
            approved_at: null,
            profiles: { username: "bob", avatar_url: "https://example.com/bob.jpg" },
          },
        ]);
      }

      if (table === "affiliate_clicks") {
        return chainable([
          { affiliate_id: "aff-1" },
          { affiliate_id: "aff-1" },
          { affiliate_id: "aff-1" },
        ]);
      }

      if (table === "affiliate_conversions") {
        return chainable([
          { affiliate_id: "aff-1", commission_sats: 500, status: "paid" },
          { affiliate_id: "aff-1", commission_sats: 300, status: "pending" },
        ]);
      }

      return chainable([]);
    });

    const res = await GET(makeRequest("offer-1"), makeParams("offer-1"));
    expect(res.status).toBe(200);
    const body = await res.json();

    // Check offer
    expect(body.offer.title).toBe("Test Offer");
    expect(body.offer.total_clicks).toBe(50);

    // Check affiliates
    expect(body.affiliates).toHaveLength(2);

    // Approved affiliate should be first (sorted by status)
    const alice = body.affiliates[0];
    expect(alice.username).toBe("alice");
    expect(alice.status).toBe("approved");
    expect(alice.tracking_url).toBe(
      "https://ugig.net/api/affiliates/click?ugig_ref=alice-abc123"
    );
    expect(alice.clicks_30d).toBe(3);
    expect(alice.conversions).toBe(2);
    expect(alice.earned_sats).toBe(500);
    expect(alice.pending_sats).toBe(300);

    // Pending affiliate
    const bob = body.affiliates[1];
    expect(bob.username).toBe("bob");
    expect(bob.status).toBe("pending");
    expect(bob.tracking_url).toBeNull();
  });

  it("returns empty array when no affiliates", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-seller", authMethod: "session" },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "affiliate_offers") {
        return chainable({
          id: "offer-1",
          seller_id: "user-seller",
          title: "Empty Offer",
          slug: "empty",
          status: "active",
          commission_rate: 0.05,
          commission_type: "percentage",
          commission_flat_sats: 0,
          total_clicks: 0,
          total_conversions: 0,
          total_revenue_sats: 0,
          total_commissions_sats: 0,
        });
      }

      return chainable([]);
    });

    const res = await GET(makeRequest("offer-1"), makeParams("offer-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.affiliates).toEqual([]);
    expect(body.offer.title).toBe("Empty Offer");
  })
  // Regression test for #135: tracking URLs should use the request origin
  // when NEXT_PUBLIC_APP_URL is not configured
    // Regression test for #135: tracking URLs should respect NEXT_PUBLIC_APP_URL
  // instead of using a hardcoded origin
  it("uses NEXT_PUBLIC_APP_URL as origin for tracking URL instead of hardcoded domain", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://staging.example.com";
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-seller", authMethod: "session" },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "affiliate_offers") {
        return chainable({
          id: "offer-1",
          seller_id: "user-seller",
          title: "Test Offer",
          slug: "test-offer",
          status: "active",
          commission_rate: 0.1,
          commission_type: "percentage",
          commission_flat_sats: 0,
          total_clicks: 0,
          total_conversions: 0,
          total_revenue_sats: 0,
          total_commissions_sats: 0,
        });
      }

      if (table === "affiliate_applications") {
        return chainable([
          {
            id: "app-1",
            affiliate_id: "aff-1",
            status: "approved",
            tracking_code: "alice-abc123",
            created_at: "2026-01-15T00:00:00Z",
            approved_at: "2026-01-16T00:00:00Z",
            profiles: { username: "alice", avatar_url: null },
          },
        ]);
      }

      if (table === "affiliate_clicks") return chainable([]);
      if (table === "affiliate_conversions") return chainable([]);
      return chainable([]);
    });

    const res = await GET(makeRequest("offer-1"), makeParams("offer-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.affiliates[0].tracking_url).toBe(
      "http://staging.example.com/api/affiliates/click?ugig_ref=alice-abc123"
    );
  });

  it("prefers NEXT_PUBLIC_APP_URL over request origin in tracking URL", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://custom.example.com";
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-seller", authMethod: "session" },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "affiliate_offers") {
        return chainable({
          id: "offer-1",
          seller_id: "user-seller",
          title: "Test Offer",
          slug: "test-offer",
          status: "active",
          commission_rate: 0.1,
          commission_type: "percentage",
          commission_flat_sats: 0,
          total_clicks: 0,
          total_conversions: 0,
          total_revenue_sats: 0,
          total_commissions_sats: 0,
        });
      }

      if (table === "affiliate_applications") {
        return chainable([
          {
            id: "app-1",
            affiliate_id: "aff-1",
            status: "approved",
            tracking_code: "alice-abc123",
            created_at: "2026-01-15T00:00:00Z",
            approved_at: "2026-01-16T00:00:00Z",
            profiles: { username: "alice", avatar_url: null },
          },
        ]);
      }

      if (table === "affiliate_clicks") return chainable([]);
      if (table === "affiliate_conversions") return chainable([]);
      return chainable([]);
    });

    const res = await GET(
      makeRequest("offer-1", "http://localhost"),
      makeParams("offer-1")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.affiliates[0].tracking_url).toBe(
      "https://custom.example.com/api/affiliates/click?ugig_ref=alice-abc123"
    );
  });

});
