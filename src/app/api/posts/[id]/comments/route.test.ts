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
  createServiceClient: vi.fn(() => ({
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({ data: null }),
      },
    },
  })),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  newPostCommentEmail: vi.fn().mockReturnValue({ subject: "", html: "", text: "" }),
  newPostCommentReplyEmail: vi.fn().mockReturnValue({ subject: "", html: "", text: "" }),
}));

import { GET, POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";

const mockGetAuthContext = vi.mocked(getAuthContext);

// ── Helpers ────────────────────────────────────────────────────────

function makeGetRequest(id: string) {
  return new NextRequest(`http://localhost/api/posts/${id}/comments`, {
    method: "GET",
  });
}

function makePostRequest(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/posts/${id}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function chainResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "single",
    "order",
    "then",
  ]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single.mockResolvedValue(result);
  chain.order.mockResolvedValue(result);
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
//  GET /api/posts/[id]/comments
// ════════════════════════════════════════════════════════════════════

describe("GET /api/posts/[id]/comments", () => {
  it("returns 404 when post not found", async () => {
    const chain = chainResult({ data: null, error: { message: "not found" } });
    mockFrom.mockReturnValue(chain);

    const res = await GET(makeGetRequest("missing"), makeParams("missing"));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Post not found");
  });

  it("returns comments organized as threads", async () => {
    // First .from() call: check post exists
    const postChain = chainResult({
      data: { id: "post-1" },
      error: null,
    });

    // Second .from() call: fetch comments
    const comments = [
      { id: "c1", post_id: "post-1", parent_id: null, content: "Top comment", author: { id: "u1", username: "user1" }, created_at: "2024-01-01" },
      { id: "c2", post_id: "post-1", parent_id: "c1", content: "Reply to c1", author: { id: "u2", username: "user2" }, created_at: "2024-01-02" },
    ];
    const commentsChain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["select", "eq", "order"]) {
      commentsChain[m] = vi.fn().mockReturnValue(commentsChain);
    }
    commentsChain.order.mockResolvedValue({ data: comments, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return postChain;
      return commentsChain;
    });

    const res = await GET(makeGetRequest("post-1"), makeParams("post-1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.comments).toHaveLength(1); // Only top-level
    expect(json.comments[0].id).toBe("c1");
    expect(json.comments[0].replies).toHaveLength(1);
    expect(json.comments[0].replies[0].id).toBe("c2");
    expect(json.total).toBe(2);
  });

  it("returns empty comments array when no comments exist", async () => {
    const postChain = chainResult({
      data: { id: "post-1" },
      error: null,
    });

    const commentsChain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["select", "eq", "order"]) {
      commentsChain[m] = vi.fn().mockReturnValue(commentsChain);
    }
    commentsChain.order.mockResolvedValue({ data: [], error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return postChain;
      return commentsChain;
    });

    const res = await GET(makeGetRequest("post-1"), makeParams("post-1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.comments).toEqual([]);
    expect(json.total).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════
//  POST /api/posts/[id]/comments
// ════════════════════════════════════════════════════════════════════

describe("POST /api/posts/[id]/comments", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await POST(
      makePostRequest("post-1", { content: "Nice post!" }),
      makeParams("post-1")
    );
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 400 when content is missing", async () => {
    mockAuth();
    const res = await POST(makePostRequest("post-1", {}), makeParams("post-1"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it("returns 400 when content is empty", async () => {
    mockAuth();
    const res = await POST(
      makePostRequest("post-1", { content: "" }),
      makeParams("post-1")
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it("creates a top-level comment successfully", async () => {
    mockAuth("user-2");

    // Check post exists (call 1)
    const postChain = chainResult({
      data: { id: "post-1", author_id: "user-1" },
      error: null,
    });

    // Insert comment (call 2)
    const commentData = {
      id: "c1",
      post_id: "post-1",
      author_id: "user-2",
      content: "Great post!",
      author: { id: "user-2", username: "commenter" },
    };
    const insertChain = chainResult({ data: commentData, error: null });

    // Commenter profile lookup (call 3)
    const profileChain = chainResult({
      data: { username: "commenter", full_name: "A Commenter" },
      error: null,
    });

    // Full post content lookup (call 4)
    const fullPostChain = chainResult({
      data: { content: "This is the post content" },
      error: null,
    });

    // Notification insert (call 5)
    const notifChain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["insert", "then"]) {
      notifChain[m] = vi.fn().mockReturnValue(notifChain);
    }
    notifChain.then.mockImplementation((resolve: (v: unknown) => void) => {
      resolve(undefined);
      return notifChain;
    });

    // Post author profile lookup (call 6+)
    const postAuthorProfileChain = chainResult({
      data: { username: "postauthor", full_name: "Post Author" },
      error: null,
    });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return postChain;       // check post exists
      if (callCount === 2) return insertChain;     // insert comment
      if (callCount === 3) return profileChain;    // commenter profile
      if (callCount === 4) return fullPostChain;   // full post content
      if (callCount === 5) return notifChain;      // notification insert
      return postAuthorProfileChain;               // post author profile lookup
    });

    const res = await POST(
      makePostRequest("post-1", { content: "Great post!" }),
      makeParams("post-1")
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.comment.content).toBe("Great post!");
  });

  it("returns 404 when post does not exist", async () => {
    mockAuth();

    const chain = chainResult({ data: null, error: { message: "not found" } });
    mockFrom.mockReturnValue(chain);

    const res = await POST(
      makePostRequest("missing", { content: "Hello" }),
      makeParams("missing")
    );
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Post not found");
  });
});
