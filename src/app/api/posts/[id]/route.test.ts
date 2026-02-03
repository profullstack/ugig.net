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

import { GET, PUT, DELETE } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";

const mockGetAuthContext = vi.mocked(getAuthContext);

// ── Helpers ────────────────────────────────────────────────────────

function makeGetRequest(id: string) {
  return new NextRequest(`http://localhost/api/posts/${id}`, { method: "GET" });
}

function makePutRequest(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/posts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string) {
  return new NextRequest(`http://localhost/api/posts/${id}`, {
    method: "DELETE",
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function chainResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ["select", "insert", "update", "delete", "eq", "single"]) {
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

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════
//  GET /api/posts/[id]
// ════════════════════════════════════════════════════════════════════

describe("GET /api/posts/[id]", () => {
  it("returns a post by id", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const postData = {
      id: "post-1",
      content: "Hello world",
      views_count: 5,
      author: { id: "user-1", username: "testuser" },
    };

    // First .from("posts") for select, second for update (views)
    const selectChain = chainResult({ data: postData, error: null });
    const updateChain = chainResult({ data: null, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectChain;
      return updateChain;
    });

    const res = await GET(makeGetRequest("post-1"), makeParams("post-1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.post.id).toBe("post-1");
    expect(json.post.user_vote).toBeNull();
  });

  it("returns 404 when post not found", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const chain = chainResult({ data: null, error: { message: "Not found" } });
    mockFrom.mockReturnValue(chain);

    const res = await GET(makeGetRequest("missing"), makeParams("missing"));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Post not found");
  });

  it("includes user_vote when authenticated", async () => {
    mockAuth();

    const postData = {
      id: "post-1",
      content: "Hello",
      views_count: 0,
      author: { id: "user-2", username: "other" },
    };

    const selectChain = chainResult({ data: postData, error: null });
    const updateChain = chainResult({ data: null, error: null });
    const voteChain = chainResult({ data: { vote_type: 1 }, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectChain;
      if (callCount === 2) return updateChain;
      return voteChain;
    });

    const res = await GET(makeGetRequest("post-1"), makeParams("post-1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.post.user_vote).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════
//  PUT /api/posts/[id]
// ════════════════════════════════════════════════════════════════════

describe("PUT /api/posts/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await PUT(
      makePutRequest("post-1", { content: "Updated" }),
      makeParams("post-1")
    );
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 404 when post not found", async () => {
    mockAuth();
    const chain = chainResult({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const res = await PUT(
      makePutRequest("missing", { content: "Updated" }),
      makeParams("missing")
    );
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Post not found");
  });

  it("returns 403 when user is not the author", async () => {
    mockAuth("user-2");

    const existingChain = chainResult({
      data: { author_id: "user-1" },
      error: null,
    });
    mockFrom.mockReturnValue(existingChain);

    const res = await PUT(
      makePutRequest("post-1", { content: "Updated" }),
      makeParams("post-1")
    );
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe("Forbidden");
  });

  it("updates a post successfully", async () => {
    mockAuth("user-1");

    const existingChain = chainResult({
      data: { author_id: "user-1" },
      error: null,
    });
    const updatedPost = {
      id: "post-1",
      content: "Updated content",
      author: { id: "user-1", username: "testuser" },
    };
    const updateChain = chainResult({ data: updatedPost, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return existingChain;
      return updateChain;
    });

    const res = await PUT(
      makePutRequest("post-1", { content: "Updated content" }),
      makeParams("post-1")
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.post.content).toBe("Updated content");
  });
});

// ════════════════════════════════════════════════════════════════════
//  DELETE /api/posts/[id]
// ════════════════════════════════════════════════════════════════════

describe("DELETE /api/posts/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest("post-1"), makeParams("post-1"));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 404 when post not found", async () => {
    mockAuth();
    const chain = chainResult({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const res = await DELETE(makeDeleteRequest("missing"), makeParams("missing"));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Post not found");
  });

  it("returns 403 when user is not the author", async () => {
    mockAuth("user-2");

    const chain = chainResult({
      data: { author_id: "user-1" },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await DELETE(makeDeleteRequest("post-1"), makeParams("post-1"));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe("Forbidden");
  });

  it("deletes a post successfully", async () => {
    mockAuth("user-1");

    const existingChain = chainResult({
      data: { author_id: "user-1" },
      error: null,
    });
    const deleteChain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["select", "delete", "eq", "single"]) {
      deleteChain[m] = vi.fn().mockReturnValue(deleteChain);
    }
    deleteChain.eq.mockResolvedValue({ data: null, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return existingChain;
      return deleteChain;
    });

    const res = await DELETE(makeDeleteRequest("post-1"), makeParams("post-1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.message).toBe("Post deleted successfully");
  });
});
