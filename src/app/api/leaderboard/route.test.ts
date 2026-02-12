import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

// ── Mocks ──────────────────────────────────────────────────────────

const mockFrom = vi.fn();

const supabaseClient = {
  from: mockFrom,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseClient)),
}));

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/leaderboard");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString(), { method: "GET" });
}

/** Build a chainable Supabase query mock that resolves to `result`. */
function chainResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ["select", "eq", "not", "in", "gte", "single"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Make the chain itself thenable so awaiting it resolves to result
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
  // Also allow direct resolution when chain is awaited as a promise
  Object.defineProperty(chain, Symbol.toStringTag, { value: "Promise" });
  return chain;
}

/** Sample agent profiles */
function makeAgents(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `agent-${i + 1}`,
    username: `agent${i + 1}`,
    full_name: `Agent ${i + 1}`,
    avatar_url: null,
    agent_name: `Bot${i + 1}`,
    is_available: true,
  }));
}

/**
 * Set up mockFrom to return the right chainable mocks for each .from() call.
 * The leaderboard route calls .from() 4 times:
 *   1. profiles (agents)
 *   2. applications (gigs count)
 *   3. reviews (ratings)
 *   4. endorsements
 */
function setupMocks(opts: {
  agents?: { data: unknown; error: unknown };
  applications?: { data: unknown; error: unknown };
  reviews?: { data: unknown; error: unknown };
  endorsements?: { data: unknown; error: unknown };
}) {
  const chains = [
    chainResult(opts.agents ?? { data: [], error: null }),
    chainResult(opts.applications ?? { data: [], error: null }),
    chainResult(opts.reviews ?? { data: [], error: null }),
    chainResult(opts.endorsements ?? { data: [], error: null }),
  ];

  let callCount = 0;
  mockFrom.mockImplementation(() => {
    return chains[callCount++] || chains[chains.length - 1];
  });
}

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════
//  GET /api/leaderboard
// ════════════════════════════════════════════════════════════════════

describe("GET /api/leaderboard", () => {
  // ── Default behaviour ──────────────────────────────────────────

  it("returns ranked list of agents sorted by gigs (default)", async () => {
    const agents = makeAgents(3);
    setupMocks({
      agents: { data: agents, error: null },
      applications: {
        data: [
          { applicant_id: "agent-1" },
          { applicant_id: "agent-2" },
          { applicant_id: "agent-2" },
          { applicant_id: "agent-3" },
          { applicant_id: "agent-3" },
          { applicant_id: "agent-3" },
        ],
        error: null,
      },
      reviews: { data: [], error: null },
      endorsements: { data: [], error: null },
    });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.period).toBe("all");
    expect(json.sort).toBe("gigs");
    expect(json.data).toHaveLength(3);
    // Sorted by completed_gigs desc: agent-3 (3), agent-2 (2), agent-1 (1)
    expect(json.data[0].id).toBe("agent-3");
    expect(json.data[0].completed_gigs).toBe(3);
    expect(json.data[1].id).toBe("agent-2");
    expect(json.data[1].completed_gigs).toBe(2);
    expect(json.data[2].id).toBe("agent-1");
    expect(json.data[2].completed_gigs).toBe(1);
  });

  // ── Rank numbers ───────────────────────────────────────────────

  it("returns proper rank numbers starting at 1", async () => {
    const agents = makeAgents(3);
    setupMocks({
      agents: { data: agents, error: null },
      applications: { data: [], error: null },
      reviews: { data: [], error: null },
      endorsements: { data: [], error: null },
    });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.data[0].rank).toBe(1);
    expect(json.data[1].rank).toBe(2);
    expect(json.data[2].rank).toBe(3);
  });

  // ── Sort by rating ─────────────────────────────────────────────

  it("sort=rating sorts by average rating", async () => {
    const agents = makeAgents(3);
    setupMocks({
      agents: { data: agents, error: null },
      applications: { data: [], error: null },
      reviews: {
        data: [
          { reviewee_id: "agent-1", rating: 3 },
          { reviewee_id: "agent-2", rating: 5 },
          { reviewee_id: "agent-2", rating: 5 },
          { reviewee_id: "agent-3", rating: 4 },
          { reviewee_id: "agent-3", rating: 4 },
        ],
        error: null,
      },
      endorsements: { data: [], error: null },
    });

    const res = await GET(makeRequest({ sort: "rating" }));
    const json = await res.json();

    expect(json.sort).toBe("rating");
    // agent-2 avg=5.0, agent-3 avg=4.0, agent-1 avg=3.0
    expect(json.data[0].id).toBe("agent-2");
    expect(json.data[0].avg_rating).toBe(5);
    expect(json.data[1].id).toBe("agent-3");
    expect(json.data[1].avg_rating).toBe(4);
    expect(json.data[2].id).toBe("agent-1");
    expect(json.data[2].avg_rating).toBe(3);
  });

  // ── Sort by endorsements ───────────────────────────────────────

  it("sort=endorsements sorts by endorsement count", async () => {
    const agents = makeAgents(3);
    setupMocks({
      agents: { data: agents, error: null },
      applications: { data: [], error: null },
      reviews: { data: [], error: null },
      endorsements: {
        data: [
          { endorsed_id: "agent-1" },
          { endorsed_id: "agent-1" },
          { endorsed_id: "agent-1" },
          { endorsed_id: "agent-3" },
          { endorsed_id: "agent-3" },
        ],
        error: null,
      },
    });

    const res = await GET(makeRequest({ sort: "endorsements" }));
    const json = await res.json();

    expect(json.sort).toBe("endorsements");
    // agent-1 (3), agent-3 (2), agent-2 (0)
    expect(json.data[0].id).toBe("agent-1");
    expect(json.data[0].endorsements).toBe(3);
    expect(json.data[1].id).toBe("agent-3");
    expect(json.data[1].endorsements).toBe(2);
    expect(json.data[2].id).toBe("agent-2");
    expect(json.data[2].endorsements).toBe(0);
  });

  // ── Period filters ─────────────────────────────────────────────

  it("period=week calls .gte with date cutoff", async () => {
    const agents = makeAgents(1);
    const appChain = chainResult({ data: [], error: null });
    const reviewChain = chainResult({ data: [], error: null });
    const endorseChain = chainResult({ data: [], error: null });

    setupMocks({
      agents: { data: agents, error: null },
    });

    // Override to capture gte calls
    let callCount = 0;
    const agentChain = chainResult({ data: agents, error: null });
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return agentChain;
      if (callCount === 2) return appChain;
      if (callCount === 3) return reviewChain;
      return endorseChain;
    });

    const res = await GET(makeRequest({ period: "week" }));
    const json = await res.json();

    expect(json.period).toBe("week");
    // .gte should have been called on applications, reviews, and endorsements chains
    expect(appChain.gte).toHaveBeenCalledWith("created_at", expect.any(String));
    expect(reviewChain.gte).toHaveBeenCalledWith("created_at", expect.any(String));
    expect(endorseChain.gte).toHaveBeenCalledWith("created_at", expect.any(String));
  });

  it("period=month calls .gte with date cutoff", async () => {
    const agents = makeAgents(1);
    const appChain = chainResult({ data: [], error: null });
    const reviewChain = chainResult({ data: [], error: null });
    const endorseChain = chainResult({ data: [], error: null });
    const agentChain = chainResult({ data: agents, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return agentChain;
      if (callCount === 2) return appChain;
      if (callCount === 3) return reviewChain;
      return endorseChain;
    });

    const res = await GET(makeRequest({ period: "month" }));
    const json = await res.json();

    expect(json.period).toBe("month");
    expect(appChain.gte).toHaveBeenCalledWith("created_at", expect.any(String));
    expect(reviewChain.gte).toHaveBeenCalledWith("created_at", expect.any(String));
    expect(endorseChain.gte).toHaveBeenCalledWith("created_at", expect.any(String));
  });

  it("period=all does NOT call .gte on any query", async () => {
    const agents = makeAgents(1);
    const appChain = chainResult({ data: [], error: null });
    const reviewChain = chainResult({ data: [], error: null });
    const endorseChain = chainResult({ data: [], error: null });
    const agentChain = chainResult({ data: agents, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return agentChain;
      if (callCount === 2) return appChain;
      if (callCount === 3) return reviewChain;
      return endorseChain;
    });

    const res = await GET(makeRequest({ period: "all" }));
    const json = await res.json();

    expect(json.period).toBe("all");
    expect(appChain.gte).not.toHaveBeenCalled();
    expect(reviewChain.gte).not.toHaveBeenCalled();
    expect(endorseChain.gte).not.toHaveBeenCalled();
  });

  // ── Only agents ────────────────────────────────────────────────

  it("only queries profiles with account_type = agent", async () => {
    const agentChain = chainResult({ data: [], error: null });

    mockFrom.mockReturnValue(agentChain);

    await GET(makeRequest());

    // The first .from("profiles") chain should have .eq("account_type", "agent")
    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(agentChain.eq).toHaveBeenCalledWith("account_type", "agent");
  });

  // ── Empty results ──────────────────────────────────────────────

  it("empty results return proper structure", async () => {
    setupMocks({
      agents: { data: [], error: null },
    });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([]);
    expect(json.period).toBe("all");
    expect(json.sort).toBe("gigs");
  });

  it("null agents return proper structure", async () => {
    setupMocks({
      agents: { data: null, error: null },
    });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([]);
  });

  // ── Validation ─────────────────────────────────────────────────

  it("rejects invalid period parameter", async () => {
    const res = await GET(makeRequest({ period: "year" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("Invalid period");
  });

  it("rejects invalid sort parameter", async () => {
    const res = await GET(makeRequest({ sort: "invalid" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("Invalid sort");
  });

  // ── Error handling ─────────────────────────────────────────────

  it("returns 500 when agents query fails", async () => {
    setupMocks({
      agents: { data: null, error: { message: "Database error" } },
    });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Database error");
  });

  // ── Rating calculation ─────────────────────────────────────────

  it("calculates average rating rounded to 1 decimal", async () => {
    const agents = makeAgents(1);
    setupMocks({
      agents: { data: agents, error: null },
      applications: { data: [], error: null },
      reviews: {
        data: [
          { reviewee_id: "agent-1", rating: 4 },
          { reviewee_id: "agent-1", rating: 5 },
          { reviewee_id: "agent-1", rating: 3 },
        ],
        error: null,
      },
      endorsements: { data: [], error: null },
    });

    const res = await GET(makeRequest());
    const json = await res.json();

    // (4+5+3)/3 = 4.0
    expect(json.data[0].avg_rating).toBe(4);
    expect(json.data[0].review_count).toBe(3);
  });

  // ── Response fields ────────────────────────────────────────────

  it("returns all expected fields for each entry", async () => {
    const agents = makeAgents(1);
    setupMocks({
      agents: { data: agents, error: null },
      applications: { data: [{ applicant_id: "agent-1" }], error: null },
      reviews: {
        data: [{ reviewee_id: "agent-1", rating: 4 }],
        error: null,
      },
      endorsements: {
        data: [{ endorsed_id: "agent-1" }],
        error: null,
      },
    });

    const res = await GET(makeRequest());
    const json = await res.json();
    const entry = json.data[0];

    expect(entry).toEqual({
      rank: 1,
      id: "agent-1",
      username: "agent1",
      full_name: "Agent 1",
      avatar_url: null,
      agent_name: "Bot1",
      is_available: true,
      completed_gigs: 1,
      avg_rating: 4,
      review_count: 1,
      endorsements: 1,
    });
  });
});
