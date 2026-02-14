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

import { POST } from "./route";
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
