import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

const mockFrom = vi.fn();

const supabaseClient = {
  from: mockFrom,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseClient)),
}));

import { GET } from "./route";

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(params: Record<string, string>) {
  const url = new URL("http://localhost/api/search");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

/**
 * Build a chainable Supabase query mock.
 * Every method returns the same chain object so calls can be stacked.
 * The terminal `.range()` resolves with `result`.
 */
function chainResult(result: {
  data: unknown;
  error: unknown;
  count?: number | null;
}) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = [
    "select",
    "eq",
    "or",
    "ilike",
    "order",
    "range",
    "single",
    "cs",
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // .range() is the terminal call in the search route
  chain.range.mockResolvedValue(result);
  return chain;
}

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════
//  GET /api/search
// ════════════════════════════════════════════════════════════════════

describe("GET /api/search", () => {
  // ── Validation ─────────────────────────────────────────────────

  it("returns 400 when q param is missing", async () => {
    const res = await GET(makeRequest({}));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe("Search query is required");
  });

  it("returns 400 when q param is empty/whitespace", async () => {
    const res = await GET(makeRequest({ q: "   " }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe("Search query is required");
  });

  it("returns 400 for invalid type param", async () => {
    const res = await GET(makeRequest({ q: "test", type: "invalid" }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toContain("Invalid type");
  });

  // ── type=gigs ──────────────────────────────────────────────────

  it("returns only gigs when type=gigs", async () => {
    const gigsData = [
      { id: "g1", title: "React gig", poster: { id: "u1", username: "dev1" } },
    ];
    const gigsChain = chainResult({
      data: gigsData,
      error: null,
      count: 1,
    });
    mockFrom.mockReturnValue(gigsChain);

    const res = await GET(makeRequest({ q: "react", type: "gigs" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.query).toBe("react");
    expect(json.type).toBe("gigs");
    expect(json.results.gigs.data).toEqual(gigsData);
    expect(json.results.gigs.total).toBe(1);
    expect(json.results.gigs.hasMore).toBe(false);
    // Should NOT include agents or posts
    expect(json.results.agents).toBeUndefined();
    expect(json.results.posts).toBeUndefined();
  });

  // ── type=agents ────────────────────────────────────────────────

  it("returns only agents when type=agents", async () => {
    const agentsData = [
      { id: "a1", username: "agent1", full_name: "Agent One" },
    ];
    const agentsChain = chainResult({
      data: agentsData,
      error: null,
      count: 1,
    });
    mockFrom.mockReturnValue(agentsChain);

    const res = await GET(makeRequest({ q: "agent", type: "agents" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.type).toBe("agents");
    expect(json.results.agents.data).toEqual(agentsData);
    expect(json.results.agents.total).toBe(1);
    expect(json.results.gigs).toBeUndefined();
    expect(json.results.posts).toBeUndefined();
  });

  // ── type=posts ─────────────────────────────────────────────────

  it("returns only posts when type=posts", async () => {
    const postsData = [
      {
        id: "p1",
        content: "My post about testing",
        author: { id: "u1", username: "dev1" },
      },
    ];
    const postsChain = chainResult({
      data: postsData,
      error: null,
      count: 1,
    });
    mockFrom.mockReturnValue(postsChain);

    const res = await GET(makeRequest({ q: "testing", type: "posts" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.type).toBe("posts");
    expect(json.results.posts.data).toEqual(postsData);
    expect(json.results.posts.total).toBe(1);
    expect(json.results.gigs).toBeUndefined();
    expect(json.results.agents).toBeUndefined();
  });

  // ── type=all (default) ────────────────────────────────────────

  it("returns grouped results with hasMore flags for type=all", async () => {
    const gigsData = Array.from({ length: 5 }, (_, i) => ({
      id: `g${i}`,
      title: `Gig ${i}`,
    }));
    const agentsData = [{ id: "a1", username: "agent1" }];
    const postsData = [{ id: "p1", content: "post content" }];

    // Three calls to .from(): gigs, profiles, posts
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === "gigs") {
        return chainResult({ data: gigsData, error: null, count: 12 });
      }
      if (table === "profiles") {
        return chainResult({ data: agentsData, error: null, count: 1 });
      }
      if (table === "posts") {
        return chainResult({ data: postsData, error: null, count: 1 });
      }
      return chainResult({ data: [], error: null, count: 0 });
    });

    const res = await GET(makeRequest({ q: "test" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.type).toBe("all");

    // Gigs: 12 total, showing 5 → hasMore = true
    expect(json.results.gigs.data).toEqual(gigsData);
    expect(json.results.gigs.total).toBe(12);
    expect(json.results.gigs.hasMore).toBe(true);
    expect(json.results.gigs.limit).toBe(5); // all mode uses limit=5

    // Agents: 1 total, showing 1 → hasMore = false
    expect(json.results.agents.data).toEqual(agentsData);
    expect(json.results.agents.total).toBe(1);
    expect(json.results.agents.hasMore).toBe(false);

    // Posts: 1 total, showing 1 → hasMore = false
    expect(json.results.posts.data).toEqual(postsData);
    expect(json.results.posts.total).toBe(1);
    expect(json.results.posts.hasMore).toBe(false);
  });

  // ── Pagination ────────────────────────────────────────────────

  it("applies page and limit params for type=gigs", async () => {
    const chain = chainResult({ data: [], error: null, count: 30 });
    mockFrom.mockReturnValue(chain);

    const res = await GET(
      makeRequest({ q: "test", type: "gigs", page: "3", limit: "5" })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    // offset = (3-1)*5 = 10, range(10, 14)
    expect(chain.range).toHaveBeenCalledWith(10, 14);
    expect(json.results.gigs.page).toBe(3);
    expect(json.results.gigs.limit).toBe(5);
    // 30 total > 10 + 5 = 15 → hasMore = true
    expect(json.results.gigs.hasMore).toBe(true);
  });

  it("clamps limit to max 50", async () => {
    const chain = chainResult({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    await GET(makeRequest({ q: "test", type: "gigs", limit: "999" }));

    // range should be called with limit capped at 50: range(0, 49)
    expect(chain.range).toHaveBeenCalledWith(0, 49);
  });

  it("clamps limit minimum to 1", async () => {
    const chain = chainResult({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    await GET(makeRequest({ q: "test", type: "gigs", limit: "-5" }));

    // Number("-5") is -5 (truthy), Math.max(1, -5) = 1, range(0, 0)
    expect(chain.range).toHaveBeenCalledWith(0, 0);
  });

  it("clamps page minimum to 1", async () => {
    const chain = chainResult({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    await GET(makeRequest({ q: "test", type: "gigs", page: "-1" }));

    // page=1, offset=0
    expect(chain.range).toHaveBeenCalledWith(0, 9);
  });

  // ── SQL character escaping ────────────────────────────────────

  it("escapes % in search query", async () => {
    const chain = chainResult({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    await GET(makeRequest({ q: "100%", type: "gigs" }));

    // The .or() call should contain escaped pattern
    expect(chain.or).toHaveBeenCalled();
    const orArg = chain.or.mock.calls[0][0] as string;
    expect(orArg).toContain("100\\%");
    expect(orArg).not.toContain("100%%");
  });

  it("escapes _ in search query", async () => {
    const chain = chainResult({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    await GET(makeRequest({ q: "my_var", type: "gigs" }));

    expect(chain.or).toHaveBeenCalled();
    const orArg = chain.or.mock.calls[0][0] as string;
    expect(orArg).toContain("my\\_var");
  });

  // ── Empty results ─────────────────────────────────────────────

  it("returns proper empty structure for type=all", async () => {
    mockFrom.mockImplementation(() =>
      chainResult({ data: [], error: null, count: 0 })
    );

    const res = await GET(makeRequest({ q: "zzz_nothing" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.results.gigs.data).toEqual([]);
    expect(json.results.gigs.total).toBe(0);
    expect(json.results.gigs.hasMore).toBe(false);
    expect(json.results.agents.data).toEqual([]);
    expect(json.results.agents.total).toBe(0);
    expect(json.results.agents.hasMore).toBe(false);
    expect(json.results.posts.data).toEqual([]);
    expect(json.results.posts.total).toBe(0);
    expect(json.results.posts.hasMore).toBe(false);
  });

  it("returns proper empty structure for single type", async () => {
    const chain = chainResult({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    const res = await GET(makeRequest({ q: "nothing", type: "agents" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.results.agents.data).toEqual([]);
    expect(json.results.agents.total).toBe(0);
  });

  // ── Gig query fallback on error ───────────────────────────────

  it("falls back to simpler gig query when primary fails", async () => {
    // First chain for gigs: error (skills_required containment fails)
    const errorChain = chainResult({
      data: null,
      error: { message: "invalid input syntax" },
      count: null,
    });
    // Second chain for gigs (fallback): success
    const fallbackChain = chainResult({
      data: [{ id: "g1", title: "Fallback gig" }],
      error: null,
      count: 1,
    });
    // Agents chain
    const agentsChain = chainResult({ data: [], error: null, count: 0 });
    // Posts chain
    const postsChain = chainResult({ data: [], error: null, count: 0 });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === "gigs") {
        // First gigs call returns error, second is fallback
        return callCount === 1 ? errorChain : fallbackChain;
      }
      if (table === "profiles") return agentsChain;
      if (table === "posts") return postsChain;
      return chainResult({ data: [], error: null, count: 0 });
    });

    const res = await GET(makeRequest({ q: "test" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.results.gigs.data).toEqual([{ id: "g1", title: "Fallback gig" }]);
    expect(json.results.gigs.total).toBe(1);
  });

  // ── Error handling ────────────────────────────────────────────

  it("returns 500 on unexpected errors", async () => {
    mockFrom.mockImplementation(() => {
      throw new Error("Connection refused");
    });

    const res = await GET(makeRequest({ q: "test" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("An unexpected error occurred");
  });
});
