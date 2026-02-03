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

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

import { GET } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";

const mockGetAuthContext = vi.mocked(getAuthContext);

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/feed");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString(), { method: "GET" });
}

function chainResult(result: {
  data: unknown;
  error: unknown;
  count?: number | null;
}) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of [
    "select",
    "eq",
    "in",
    "gte",
    "contains",
    "overlaps",
    "order",
    "range",
    "single",
  ]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.range.mockResolvedValue(result);
  return chain;
}

function makePosts(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `post-${i + 1}`,
    content: `Post ${i + 1}`,
    score: count - i,
    created_at: new Date(Date.now() - i * 60 * 60 * 1000).toISOString(),
    author: { id: `user-${i}`, username: `user${i}` },
  }));
}

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthContext.mockResolvedValue(null);
});

// ════════════════════════════════════════════════════════════════════
//  GET /api/feed
// ════════════════════════════════════════════════════════════════════

describe("GET /api/feed", () => {
  // ── Default behaviour ──────────────────────────────────────────

  it("returns paginated feed with default params", async () => {
    const posts = makePosts(3);
    const chain = chainResult({ data: posts, error: null, count: 3 });
    mockFrom.mockReturnValue(chain);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.posts).toHaveLength(3);
    expect(json.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 3,
      totalPages: 1,
    });
  });

  it("applies pagination params", async () => {
    const chain = chainResult({ data: [], error: null, count: 50 });
    mockFrom.mockReturnValue(chain);

    const res = await GET(makeRequest({ page: "3", limit: "10" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    // offset = (3-1)*10 = 20, range(20, 29)
    expect(chain.range).toHaveBeenCalledWith(20, 29);
    expect(json.pagination.page).toBe(3);
    expect(json.pagination.limit).toBe(10);
    expect(json.pagination.totalPages).toBe(5);
  });

  // ── Sort modes ─────────────────────────────────────────────────

  it("sort=new orders by created_at descending", async () => {
    const chain = chainResult({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    await GET(makeRequest({ sort: "new" }));
    expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("sort=top orders by score descending", async () => {
    const chain = chainResult({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    await GET(makeRequest({ sort: "top" }));
    expect(chain.order).toHaveBeenCalledWith("score", { ascending: false });
  });

  it("sort=rising filters to last 24h and orders by score", async () => {
    const chain = chainResult({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    await GET(makeRequest({ sort: "rising" }));
    expect(chain.gte).toHaveBeenCalledWith("created_at", expect.any(String));
    expect(chain.order).toHaveBeenCalledWith("score", { ascending: false });
  });

  it("sort=hot applies Reddit-style ranking to results", async () => {
    const posts = [
      { id: "old-high", content: "Old", score: 100, created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), author: { id: "u1" } },
      { id: "new-low", content: "New", score: 10, created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), author: { id: "u2" } },
    ];
    const chain = chainResult({ data: posts, error: null, count: 2 });
    mockFrom.mockReturnValue(chain);

    const res = await GET(makeRequest({ sort: "hot" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.posts).toHaveLength(2);
    // New post with lower score should rank higher due to recency
    expect(json.posts[0].id).toBe("new-low");
  });

  // ── Tag filter ─────────────────────────────────────────────────

  it("filters by tag when provided", async () => {
    const chain = chainResult({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    await GET(makeRequest({ tag: "rust" }));
    expect(chain.contains).toHaveBeenCalledWith("tags", ["rust"]);
  });

  // ── Following sort ─────────────────────────────────────────────

  it("sort=following returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await GET(makeRequest({ sort: "following" }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toContain("Login required");
  });

  it("sort=following returns empty when no followed tags", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1" } as never,
      supabase: supabaseClient,
    } as never);

    const tagChain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["select", "eq"]) {
      tagChain[m] = vi.fn().mockReturnValue(tagChain);
    }
    tagChain.eq.mockResolvedValue({ data: [], error: null });
    mockFrom.mockReturnValue(tagChain);

    const res = await GET(makeRequest({ sort: "following" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.posts).toEqual([]);
    expect(json.emptyFollowing).toBe(true);
  });

  // ── User votes ─────────────────────────────────────────────────

  it("includes user_vote when authenticated", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1" } as never,
      supabase: supabaseClient,
    } as never);

    const posts = [{ id: "post-1", content: "Hello", score: 5, created_at: new Date().toISOString(), author: { id: "u2" } }];
    const feedChain = chainResult({ data: posts, error: null, count: 1 });

    // Votes query
    const votesChain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["select", "eq", "in"]) {
      votesChain[m] = vi.fn().mockReturnValue(votesChain);
    }
    votesChain.in.mockResolvedValue({
      data: [{ post_id: "post-1", vote_type: 1 }],
      error: null,
    });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return feedChain;
      return votesChain;
    });

    const res = await GET(makeRequest({ sort: "new" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.posts[0].user_vote).toBe(1);
  });

  // ── Validation ─────────────────────────────────────────────────

  it("returns 400 for invalid sort param", async () => {
    const res = await GET(makeRequest({ sort: "invalid" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  // ── Error handling ─────────────────────────────────────────────

  it("returns 400 on database error", async () => {
    const chain = chainResult({
      data: null,
      error: { message: "Database error" },
      count: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Database error");
  });

  it("returns 500 on unexpected error", async () => {
    mockFrom.mockImplementation(() => {
      throw new Error("Connection refused");
    });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("An unexpected error occurred");
  });
});
