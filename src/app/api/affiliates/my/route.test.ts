import { describe, it, expect, vi, beforeEach } from "vitest";
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

import { GET } from "./route";

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/affiliates/my");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url, { method: "GET" });
}

// Chainable proxy for supabase queries
function chainable(data: unknown, error: unknown = null) {
  const result = { data, error };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === "then") return undefined;
      if (prop === "data") return data;
      if (prop === "error") return error;
      return (..._args: unknown[]) => new Proxy(result, handler);
    },
  };
  return new Proxy(result, handler);
}

const AUTH_USER = { user: { id: "user-123" } };

describe("GET /api/affiliates/my", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Auth ─────────────────────────────────────────────────────────────────

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  // ── Seller view ──────────────────────────────────────────────────────────

  it("returns seller offers and aggregated stats for view=seller", async () => {
    mockGetAuthContext.mockResolvedValue(AUTH_USER);

    const offers = [
      { id: "o1", title: "Offer 1", total_revenue_sats: 5000, total_commissions_sats: 500, total_affiliates: 3 },
      { id: "o2", title: "Offer 2", total_revenue_sats: 3000, total_commissions_sats: 300, total_affiliates: 1 },
    ];
    mockFrom.mockReturnValue(chainable(offers));

    const res = await GET(makeRequest({ view: "seller" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.view).toBe("seller");
    expect(body.offers).toHaveLength(2);
    expect(body.stats).toEqual({
      total_offers: 2,
      total_revenue_sats: 8000,
      total_commissions_sats: 800,
      total_affiliates: 4,
    });
  });

  it("returns empty stats for seller with no offers", async () => {
    mockGetAuthContext.mockResolvedValue(AUTH_USER);
    mockFrom.mockReturnValue(chainable([]));

    const res = await GET(makeRequest({ view: "seller" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.offers).toEqual([]);
    expect(body.stats.total_offers).toBe(0);
    expect(body.stats.total_revenue_sats).toBe(0);
  });

  it("handles null offers from DB gracefully in seller view", async () => {
    mockGetAuthContext.mockResolvedValue(AUTH_USER);
    mockFrom.mockReturnValue(chainable(null));

    const res = await GET(makeRequest({ view: "seller" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.offers).toEqual([]);
    expect(body.stats.total_offers).toBe(0);
  });

  it("returns 400 when seller DB query fails", async () => {
    mockGetAuthContext.mockResolvedValue(AUTH_USER);
    mockFrom.mockReturnValue(chainable(null, { message: "relation not found" }));

    const res = await GET(makeRequest({ view: "seller" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("relation not found");
  });

  // ── Affiliate view (default) ─────────────────────────────────────────────

  it("defaults to affiliate view when no view param", async () => {
    mockGetAuthContext.mockResolvedValue(AUTH_USER);
    mockFrom
      .mockReturnValueOnce(chainable([]))  // applications
      .mockReturnValueOnce(chainable([]))  // conversions
      .mockReturnValueOnce(chainable([])); // clicks

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.view).toBe("affiliate");
  });

  it("returns applications, conversions, and stats for affiliate view", async () => {
    mockGetAuthContext.mockResolvedValue(AUTH_USER);

    const applications = [
      { id: "app1", status: "approved", affiliate_id: "user-123" },
      { id: "app2", status: "pending", affiliate_id: "user-123" },
      { id: "app3", status: "approved", affiliate_id: "user-123" },
    ];
    const conversions = [
      { id: "c1", status: "paid", commission_sats: 200, affiliate_id: "user-123" },
      { id: "c2", status: "paid", commission_sats: 300, affiliate_id: "user-123" },
      { id: "c3", status: "pending", commission_sats: 100, affiliate_id: "user-123" },
    ];
    const clicks = [
      { offer_id: "o1", created_at: new Date().toISOString() },
      { offer_id: "o1", created_at: new Date().toISOString() },
      { offer_id: "o2", created_at: new Date().toISOString() },
    ];

    mockFrom
      .mockReturnValueOnce(chainable(applications))
      .mockReturnValueOnce(chainable(conversions))
      .mockReturnValueOnce(chainable(clicks));

    const res = await GET(makeRequest({ view: "affiliate" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.view).toBe("affiliate");
    expect(body.applications).toHaveLength(3);
    expect(body.conversions).toHaveLength(3);
    expect(body.stats).toEqual({
      total_clicks_30d: 3,
      total_conversions: 3,
      total_earned_sats: 500,   // sum of paid: 200 + 300
      total_pending_sats: 100,  // sum of pending: 100
      active_offers: 2,         // approved applications only
    });
  });

  it("counts only approved applications as active_offers", async () => {
    mockGetAuthContext.mockResolvedValue(AUTH_USER);

    const applications = [
      { id: "app1", status: "approved" },
      { id: "app2", status: "pending" },
      { id: "app3", status: "rejected" },
      { id: "app4", status: "approved" },
    ];

    mockFrom
      .mockReturnValueOnce(chainable(applications))
      .mockReturnValueOnce(chainable([]))
      .mockReturnValueOnce(chainable([]));

    const res = await GET(makeRequest({ view: "affiliate" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.stats.active_offers).toBe(2);
  });

  it("computes total_earned_sats from paid conversions only", async () => {
    mockGetAuthContext.mockResolvedValue(AUTH_USER);

    const conversions = [
      { id: "c1", status: "paid", commission_sats: 1000 },
      { id: "c2", status: "pending", commission_sats: 500 },
      { id: "c3", status: "failed", commission_sats: 9999 },
    ];

    mockFrom
      .mockReturnValueOnce(chainable([]))
      .mockReturnValueOnce(chainable(conversions))
      .mockReturnValueOnce(chainable([]));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.stats.total_earned_sats).toBe(1000);
    expect(body.stats.total_pending_sats).toBe(500);
  });

  it("returns 400 when applications query fails", async () => {
    mockGetAuthContext.mockResolvedValue(AUTH_USER);

    mockFrom.mockReturnValueOnce(chainable(null, { message: "applications table missing" }));

    const res = await GET(makeRequest({ view: "affiliate" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("applications table missing");
  });

  it("returns 400 when conversions query fails", async () => {
    mockGetAuthContext.mockResolvedValue(AUTH_USER);

    mockFrom
      .mockReturnValueOnce(chainable([]))  // applications OK
      .mockReturnValueOnce(chainable(null, { message: "conversions table missing" }));

    const res = await GET(makeRequest({ view: "affiliate" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("conversions table missing");
  });

  it("handles null clicks gracefully (no error surfaced)", async () => {
    mockGetAuthContext.mockResolvedValue(AUTH_USER);

    mockFrom
      .mockReturnValueOnce(chainable([]))   // applications
      .mockReturnValueOnce(chainable([]))   // conversions
      .mockReturnValueOnce(chainable(null)); // clicks query returned null

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.stats.total_clicks_30d).toBe(0);
  });
});
