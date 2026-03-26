import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

const mockFrom = vi.fn();
const mockRpc = vi.fn().mockResolvedValue({ error: null });

const supabaseClient = {
  from: mockFrom,
  rpc: mockRpc,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseClient)),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  rateLimitExceeded: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => "test-user"),
}));

vi.mock("@/lib/reputation-hooks", () => ({
  getUserDid: vi.fn().mockResolvedValue(null),
  onGigPosted: vi.fn(),
}));

const mockLogActivity = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/activity", () => ({
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
}));

import { GET, POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";

const mockGetAuthContext = vi.mocked(getAuthContext);

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/gigs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function chainResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ["select", "insert", "upsert", "eq", "single", "gte", "lte", "overlaps", "or", "order", "range"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single.mockResolvedValue(result);
  return chain;
}

function mockAuth(userId = "user-1") {
  mockGetAuthContext.mockResolvedValue({
    user: { id: userId } as never,
    supabase: supabaseClient,
  } as never);
}

const validGigBody = {
  title: "Test Gig Title Here",
  description: "A test gig description that is long enough to pass the fifty character validation minimum requirement for gig descriptions.",
  category: "development",
  budget_type: "fixed" as const,
  budget_min: 100,
  budget_max: 500,
  location_type: "remote" as const,
  skills_required: ["typescript"],
  ai_tools_preferred: [],
  status: "active",
};

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════
//  GET /api/gigs
// ════════════════════════════════════════════════════════════════════

describe("GET /api/gigs", () => {
  function makeGetRequest(params: Record<string, string> = {}) {
    const url = new URL("http://localhost/api/gigs");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return new NextRequest(url, { method: "GET" });
  }

  it("returns gigs with pagination", async () => {
    const chain = chainResult({ data: null, error: null });
    chain.select = vi.fn().mockReturnValue(chain);
    // Override the final range call to resolve with data
    const gigs = [{ id: "g1", title: "Test", listing_type: "hiring" }];
    chain.range = vi.fn().mockResolvedValue({ data: gigs, error: null, count: 1 });

    mockFrom.mockReturnValue(chain);

    const res = await GET(makeGetRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.gigs).toEqual(gigs);
    expect(json.pagination.total).toBe(1);
  });

  it("filters by listing_type when provided", async () => {
    const chain = chainResult({ data: null, error: null });
    chain.select = vi.fn().mockReturnValue(chain);
    chain.range = vi.fn().mockResolvedValue({ data: [], error: null, count: 0 });

    mockFrom.mockReturnValue(chain);

    await GET(makeGetRequest({ listing_type: "for_hire" }));

    // Should have called .eq with listing_type
    const eqCalls = chain.eq.mock.calls;
    const listingTypeCall = eqCalls.find(
      (call: unknown[]) => call[0] === "listing_type" && call[1] === "for_hire"
    );
    expect(listingTypeCall).toBeTruthy();
  });

  it("defaults to listing_type=hiring when not provided", async () => {
    const chain = chainResult({ data: null, error: null });
    chain.select = vi.fn().mockReturnValue(chain);
    chain.range = vi.fn().mockResolvedValue({ data: [], error: null, count: 0 });

    mockFrom.mockReturnValue(chain);

    await GET(makeGetRequest());

    const eqCalls = chain.eq.mock.calls;
    const listingTypeCall = eqCalls.find(
      (call: unknown[]) => call[0] === "listing_type"
    );
    expect(listingTypeCall).toBeDefined();
    expect(listingTypeCall![1]).toBe("hiring");
  });

  it("returns error on invalid filters", async () => {
    const res = await GET(makeGetRequest({ budget_type: "invalid_type" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });
});

// ════════════════════════════════════════════════════════════════════
//  POST /api/gigs
// ════════════════════════════════════════════════════════════════════

describe("POST /api/gigs", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await POST(makeRequest(validGigBody));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("creates a gig and logs gig_posted activity", async () => {
    mockAuth();

    const gigData = { id: "gig-1", title: "Test Gig", status: "active" };

    // subscription check → free plan
    const subChain = chainResult({ data: { plan: "free" }, error: null });
    // usage check → under limit
    const usageChain = chainResult({ data: { posts_count: 0 }, error: null });
    // gig insert
    const insertChain = chainResult({ data: gigData, error: null });
    // upsert gig_usage
    const upsertChain: Record<string, unknown> = {};
    upsertChain.upsert = vi.fn().mockResolvedValue({ error: null });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === "subscriptions") return subChain;
      if (table === "gig_usage" && callCount <= 3) return usageChain;
      if (table === "gigs") return insertChain;
      return upsertChain; // gig_usage upsert
    });

    const res = await POST(makeRequest(validGigBody));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.gig).toEqual(gigData);

    expect(mockLogActivity).toHaveBeenCalledWith(
      supabaseClient,
      expect.objectContaining({
        userId: "user-1",
        activityType: "gig_posted",
        referenceId: "gig-1",
        referenceType: "gig",
      })
    );
  });

  it("creates a for_hire gig with listing_type", async () => {
    mockAuth();

    const gigData = { id: "gig-2", title: "For Hire", status: "active", listing_type: "for_hire" };

    const subChain = chainResult({ data: { plan: "free" }, error: null });
    const usageChain = chainResult({ data: { posts_count: 0 }, error: null });
    const insertChain = chainResult({ data: gigData, error: null });
    const upsertChain: Record<string, unknown> = {};
    upsertChain.upsert = vi.fn().mockResolvedValue({ error: null });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === "subscriptions") return subChain;
      if (table === "gig_usage" && callCount <= 3) return usageChain;
      if (table === "gigs") return insertChain;
      return upsertChain;
    });

    const res = await POST(makeRequest({ ...validGigBody, listing_type: "for_hire" }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.gig.listing_type).toBe("for_hire");
  });

  it("defaults listing_type to hiring when not specified", async () => {
    mockAuth();

    const gigData = { id: "gig-3", title: "Hiring", status: "active", listing_type: "hiring" };

    const subChain = chainResult({ data: { plan: "pro" }, error: null });
    const insertChain = chainResult({ data: gigData, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "subscriptions") return subChain;
      return insertChain;
    });

    const res = await POST(makeRequest(validGigBody));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.gig.listing_type).toBe("hiring");
  });

  it("does not log activity on insert error", async () => {
    mockAuth();

    const subChain = chainResult({ data: { plan: "pro" }, error: null });
    const insertChain = chainResult({ data: null, error: { message: "fail" } });

    mockFrom.mockImplementation((table: string) => {
      if (table === "subscriptions") return subChain;
      return insertChain;
    });

    const res = await POST(makeRequest(validGigBody));
    expect(res.status).toBe(400);
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});
