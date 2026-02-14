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

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  rateLimitExceeded: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => "test-user"),
}));

vi.mock("@/lib/reputation-hooks", () => ({
  getUserDid: vi.fn(() => Promise.resolve(null)),
  onUpvoted: vi.fn(),
  onContentDownvoted: vi.fn(),
}));

import { POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";

const mockGetAuthContext = vi.mocked(getAuthContext);

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest(
    "http://localhost/api/posts/post-1/comments/comment-1/vote",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function mockAuth(userId = "user-1") {
  mockGetAuthContext.mockResolvedValue({
    user: { id: userId } as never,
    supabase: supabaseClient,
  } as never);
}

function makeChain(finalResult: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ["select", "insert", "update", "delete", "eq", "single"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single.mockResolvedValue(finalResult);
  return chain;
}

function makeParams(id = "post-1", commentId = "comment-1") {
  return { params: Promise.resolve({ id, commentId }) };
}

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth();
});

// ── Tests ──────────────────────────────────────────────────────────

describe("POST /api/posts/[id]/comments/[commentId]/vote", () => {
  it("creates a new upvote", async () => {
    const commentChain = makeChain({
      data: { id: "comment-1", post_id: "post-1" },
      error: null,
    });
    const existingVoteChain = makeChain({ data: null, error: { code: "PGRST116" } });
    const insertChain = makeChain({ data: null, error: null });
    const updatedChain = makeChain({
      data: { upvotes: 1, downvotes: 0, score: 1 },
      error: null,
    });

    let callIdx = 0;
    const chains = [commentChain, existingVoteChain, insertChain, updatedChain];
    mockFrom.mockImplementation(() => chains[callIdx++]);

    const res = await POST(makeRequest({ direction: "up" }), makeParams());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.upvotes).toBe(1);
    expect(json.score).toBe(1);
    expect(json.user_vote).toBe(1);
  });

  it("creates a new downvote", async () => {
    const commentChain = makeChain({
      data: { id: "comment-1", post_id: "post-1" },
      error: null,
    });
    const existingVoteChain = makeChain({ data: null, error: { code: "PGRST116" } });
    const insertChain = makeChain({ data: null, error: null });
    const updatedChain = makeChain({
      data: { upvotes: 0, downvotes: 1, score: -1 },
      error: null,
    });

    let callIdx = 0;
    mockFrom.mockImplementation(() => [commentChain, existingVoteChain, insertChain, updatedChain][callIdx++]);

    const res = await POST(makeRequest({ direction: "down" }), makeParams());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.downvotes).toBe(1);
    expect(json.score).toBe(-1);
    expect(json.user_vote).toBe(-1);
  });

  it("toggles off same vote", async () => {
    const commentChain = makeChain({
      data: { id: "comment-1", post_id: "post-1" },
      error: null,
    });
    const existingVoteChain = makeChain({
      data: { id: "vote-1", vote_type: 1 },
      error: null,
    });
    const deleteChain = makeChain({ data: null, error: null });
    const updatedChain = makeChain({
      data: { upvotes: 0, downvotes: 0, score: 0 },
      error: null,
    });

    let callIdx = 0;
    mockFrom.mockImplementation(() => [commentChain, existingVoteChain, deleteChain, updatedChain][callIdx++]);

    const res = await POST(makeRequest({ direction: "up" }), makeParams());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.user_vote).toBeNull();
    expect(json.score).toBe(0);
  });

  it("switches vote direction", async () => {
    const commentChain = makeChain({
      data: { id: "comment-1", post_id: "post-1" },
      error: null,
    });
    const existingVoteChain = makeChain({
      data: { id: "vote-1", vote_type: 1 },
      error: null,
    });
    const updateChain = makeChain({ data: null, error: null });
    const updatedChain = makeChain({
      data: { upvotes: 0, downvotes: 1, score: -1 },
      error: null,
    });

    let callIdx = 0;
    mockFrom.mockImplementation(() => [commentChain, existingVoteChain, updateChain, updatedChain][callIdx++]);

    const res = await POST(makeRequest({ direction: "down" }), makeParams());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.user_vote).toBe(-1);
    expect(json.score).toBe(-1);
  });

  it("rejects invalid direction", async () => {
    const res = await POST(makeRequest({ direction: "sideways" }), makeParams());
    expect(res.status).toBe(400);
  });

  it("returns 404 for nonexistent comment", async () => {
    const commentChain = makeChain({ data: null, error: null });
    commentChain.single.mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue(commentChain);

    const res = await POST(makeRequest({ direction: "up" }), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await POST(makeRequest({ direction: "up" }), makeParams());
    expect(res.status).toBe(401);
  });
});
