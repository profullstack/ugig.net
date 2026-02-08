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

const mockGetUserById = vi.fn().mockResolvedValue({ data: null });

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
  createServiceClient: vi.fn(() => ({
    auth: {
      admin: {
        getUserById: mockGetUserById,
      },
    },
  })),
}));

const mockSendEmail = vi.fn().mockResolvedValue({ success: true });
const mockNewPostCommentEmail = vi.fn().mockReturnValue({ subject: "s", html: "h", text: "t" });
const mockNewPostCommentReplyEmail = vi.fn().mockReturnValue({ subject: "s", html: "h", text: "t" });

vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  newPostCommentEmail: (...args: unknown[]) => mockNewPostCommentEmail(...args),
  newPostCommentReplyEmail: (...args: unknown[]) => mockNewPostCommentReplyEmail(...args),
}));

import { GET, POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";

const mockGetAuthContext = vi.mocked(getAuthContext);

// Valid UUID v4 format: version nibble = 4, variant nibble = a
const POST_ID = "a0000000-0000-4000-a000-000000000001";
const AUTHOR_1 = "a0000000-0000-4000-a000-000000000010";
const USER_2 = "a0000000-0000-4000-a000-000000000020";
const USER_3 = "a0000000-0000-4000-a000-000000000030";
const USER_PARENT = "a0000000-0000-4000-a000-000000000040";
const COMMENT_1 = "a0000000-0000-4000-a000-000000000100";
const COMMENT_2 = "a0000000-0000-4000-a000-000000000200";
const PARENT_D3 = "a0000000-0000-4000-a000-000000000300";
const PARENT_D4 = "a0000000-0000-4000-a000-000000000400";
const PARENT_OTHER = "a0000000-0000-4000-a000-000000000500";

// ── Helpers ────────────────────────────────────────────────────────

function makeGetRequest(id: string) {
  return new NextRequest(`http://localhost/api/posts/${id}/comments`, { method: "GET" });
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

function ch(result: { data: unknown; error: unknown }) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ["select", "insert", "update", "delete", "eq", "single", "order", "then"]) {
    c[m] = vi.fn().mockReturnValue(c);
  }
  c.single.mockResolvedValue(result);
  c.order.mockResolvedValue(result);
  c.then.mockImplementation((resolve?: (v: unknown) => void) => {
    resolve?.(undefined);
    return c;
  });
  return c;
}

function mockAuth(userId: string) {
  mockGetAuthContext.mockResolvedValue({
    user: { id: userId } as never,
    supabase: supabaseClient,
  } as never);
}

function setupSeq(...chains: ReturnType<typeof ch>[]) {
  let i = 0;
  const fallback = ch({ data: { username: "x", full_name: "X" }, error: null });
  mockFrom.mockImplementation(() => {
    const c = chains[i];
    i++;
    return c || fallback;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════
//  GET — Recursive tree building
// ════════════════════════════════════════════════════════════════════

describe("GET /api/posts/[id]/comments", () => {
  it("returns 404 when post not found", async () => {
    mockFrom.mockReturnValue(ch({ data: null, error: { message: "not found" } }));
    const res = await GET(makeGetRequest("missing"), makeParams("missing"));
    expect(res.status).toBe(404);
  });

  it("builds recursive tree for 5 levels deep", async () => {
    const comments = [
      { id: "c0", post_id: "p1", parent_id: null, depth: 0, content: "L0", author: { id: "u1", username: "u1" }, created_at: "2024-01-01" },
      { id: "c1", post_id: "p1", parent_id: "c0", depth: 1, content: "L1", author: { id: "u2", username: "u2" }, created_at: "2024-01-02" },
      { id: "c2", post_id: "p1", parent_id: "c1", depth: 2, content: "L2", author: { id: "u3", username: "u3" }, created_at: "2024-01-03" },
      { id: "c3", post_id: "p1", parent_id: "c2", depth: 3, content: "L3", author: { id: "u4", username: "u4" }, created_at: "2024-01-04" },
      { id: "c4", post_id: "p1", parent_id: "c3", depth: 4, content: "L4", author: { id: "u5", username: "u5" }, created_at: "2024-01-05" },
    ];

    const postChain = ch({ data: { id: "p1" }, error: null });
    const commentsChain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["select", "eq", "order"]) commentsChain[m] = vi.fn().mockReturnValue(commentsChain);
    commentsChain.order.mockResolvedValue({ data: comments, error: null });

    let idx = 0;
    mockFrom.mockImplementation(() => { idx++; return idx === 1 ? postChain : commentsChain; });

    const res = await GET(makeGetRequest("p1"), makeParams("p1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.total).toBe(5);
    expect(json.comments).toHaveLength(1);

    let node = json.comments[0];
    for (let d = 1; d <= 4; d++) {
      expect(node.replies).toHaveLength(1);
      node = node.replies[0];
      expect(node.id).toBe("c" + d);
    }
    expect(node.replies).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════
//  POST — Nesting depth enforcement
// ════════════════════════════════════════════════════════════════════

describe("POST /api/posts/[id]/comments — nesting depth", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await POST(makePostRequest(POST_ID, { content: "Hi" }), makeParams(POST_ID));
    expect(res.status).toBe(401);
  });

  it("creates a root comment (depth 0)", async () => {
    mockAuth(USER_2);
    setupSeq(
      ch({ data: { id: POST_ID, author_id: AUTHOR_1 }, error: null }),
      ch({ data: { id: COMMENT_1, post_id: POST_ID, author_id: USER_2, content: "Hello", depth: 0, author: { id: USER_2, username: "u2" } }, error: null }),
      ch({ data: { username: "u2", full_name: "User 2" }, error: null }),
      ch({ data: { content: "Post body" }, error: null }),
    );

    const res = await POST(makePostRequest(POST_ID, { content: "Hello" }), makeParams(POST_ID));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.comment.depth).toBe(0);
  });

  it("allows reply at depth 3 (creating depth 4)", async () => {
    mockAuth(USER_2);
    setupSeq(
      ch({ data: { id: POST_ID, author_id: AUTHOR_1 }, error: null }),
      ch({ data: { id: PARENT_D3, post_id: POST_ID, parent_id: "x", depth: 3, author_id: USER_3, content: "Deep" }, error: null }),
      ch({ data: { id: COMMENT_2, post_id: POST_ID, author_id: USER_2, parent_id: PARENT_D3, content: "Deepest", depth: 4, author: { id: USER_2, username: "u2" } }, error: null }),
      ch({ data: { username: "u2", full_name: "User 2" }, error: null }),
      ch({ data: { content: "Post body" }, error: null }),
    );

    const res = await POST(makePostRequest(POST_ID, { content: "Deepest", parent_id: PARENT_D3 }), makeParams(POST_ID));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.comment.depth).toBe(4);
  });

  it("rejects reply at depth 4 (would create depth 5)", async () => {
    mockAuth(USER_2);
    setupSeq(
      ch({ data: { id: POST_ID, author_id: AUTHOR_1 }, error: null }),
      ch({ data: { id: PARENT_D4, post_id: POST_ID, parent_id: "x", depth: 4, author_id: USER_3, content: "At max" }, error: null }),
    );

    const res = await POST(makePostRequest(POST_ID, { content: "Too deep", parent_id: PARENT_D4 }), makeParams(POST_ID));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/maximum comment depth/i);
  });

  it("returns 404 when parent comment not found", async () => {
    mockAuth(USER_2);
    setupSeq(
      ch({ data: { id: POST_ID, author_id: AUTHOR_1 }, error: null }),
      ch({ data: null, error: { message: "not found" } }),
    );

    const res = await POST(makePostRequest(POST_ID, { content: "Reply", parent_id: COMMENT_1 }), makeParams(POST_ID));
    expect(res.status).toBe(404);
  });

  it("returns 400 when parent belongs to different post", async () => {
    mockAuth(USER_2);
    const OTHER_POST = "b0000000-0000-4000-a000-000000000002";
    setupSeq(
      ch({ data: { id: POST_ID, author_id: AUTHOR_1 }, error: null }),
      ch({ data: { id: PARENT_OTHER, post_id: OTHER_POST, parent_id: null, depth: 0, author_id: "u", content: "x" }, error: null }),
    );

    const res = await POST(makePostRequest(POST_ID, { content: "Reply", parent_id: PARENT_OTHER }), makeParams(POST_ID));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/different post/i);
  });
});

// ════════════════════════════════════════════════════════════════════
//  POST — Email notifications
// ════════════════════════════════════════════════════════════════════

describe("POST /api/posts/[id]/comments — email notifications", () => {
  it("sends reply email to parent comment author", async () => {
    mockAuth(USER_3);
    mockGetUserById
      .mockResolvedValueOnce({ data: { user: { email: "parent@test.com" } } })
      .mockResolvedValueOnce({ data: { user: { email: "postauthor@test.com" } } });

    setupSeq(
      ch({ data: { id: POST_ID, author_id: AUTHOR_1 }, error: null }),
      ch({ data: { id: COMMENT_1, post_id: POST_ID, parent_id: null, depth: 0, author_id: USER_PARENT, content: "Original" }, error: null }),
      ch({ data: { id: COMMENT_2, post_id: POST_ID, author_id: USER_3, parent_id: COMMENT_1, content: "Reply", depth: 1, author: { id: USER_3, username: "u3" } }, error: null }),
      ch({ data: { username: "u3", full_name: "User 3" }, error: null }),
      ch({ data: { content: "Post body" }, error: null }),
    );

    await POST(makePostRequest(POST_ID, { content: "Reply", parent_id: COMMENT_1 }), makeParams(POST_ID));
    await new Promise((r) => setTimeout(r, 100));

    expect(mockNewPostCommentReplyEmail).toHaveBeenCalledWith(
      expect.objectContaining({ replyPreview: "Reply" })
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "parent@test.com" })
    );
  });

  it("does not double-notify when post author IS parent comment author", async () => {
    mockAuth(USER_3);
    mockGetUserById.mockResolvedValue({ data: { user: { email: "author@test.com" } } });

    setupSeq(
      ch({ data: { id: POST_ID, author_id: AUTHOR_1 }, error: null }),
      ch({ data: { id: COMMENT_1, post_id: POST_ID, parent_id: null, depth: 0, author_id: AUTHOR_1, content: "My comment" }, error: null }),
      ch({ data: { id: COMMENT_2, post_id: POST_ID, author_id: USER_3, parent_id: COMMENT_1, content: "Reply", depth: 1, author: { id: USER_3, username: "u3" } }, error: null }),
      ch({ data: { username: "u3", full_name: "User 3" }, error: null }),
      ch({ data: { content: "Post body" }, error: null }),
    );

    await POST(makePostRequest(POST_ID, { content: "Reply", parent_id: COMMENT_1 }), makeParams(POST_ID));
    await new Promise((r) => setTimeout(r, 100));

    expect(mockNewPostCommentReplyEmail).toHaveBeenCalled();
    expect(mockNewPostCommentEmail).not.toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it("does not send reply email when replying to own comment", async () => {
    mockAuth(USER_2);
    mockGetUserById.mockResolvedValue({ data: { user: { email: "author@test.com" } } });

    setupSeq(
      ch({ data: { id: POST_ID, author_id: AUTHOR_1 }, error: null }),
      ch({ data: { id: COMMENT_1, post_id: POST_ID, parent_id: null, depth: 0, author_id: USER_2, content: "My comment" }, error: null }),
      ch({ data: { id: COMMENT_2, post_id: POST_ID, author_id: USER_2, parent_id: COMMENT_1, content: "Self reply", depth: 1, author: { id: USER_2, username: "u2" } }, error: null }),
      ch({ data: { username: "u2", full_name: "User 2" }, error: null }),
      ch({ data: { content: "Post body" }, error: null }),
    );

    await POST(makePostRequest(POST_ID, { content: "Self reply", parent_id: COMMENT_1 }), makeParams(POST_ID));
    await new Promise((r) => setTimeout(r, 100));

    expect(mockNewPostCommentReplyEmail).not.toHaveBeenCalled();
    expect(mockNewPostCommentEmail).toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it("sends zero emails when user replies to own comment on own post", async () => {
    mockAuth(AUTHOR_1);

    setupSeq(
      ch({ data: { id: POST_ID, author_id: AUTHOR_1 }, error: null }),
      ch({ data: { id: COMMENT_1, post_id: POST_ID, parent_id: null, depth: 0, author_id: AUTHOR_1, content: "Own comment" }, error: null }),
      ch({ data: { id: COMMENT_2, post_id: POST_ID, author_id: AUTHOR_1, parent_id: COMMENT_1, content: "Own reply", depth: 1, author: { id: AUTHOR_1, username: "a1" } }, error: null }),
      ch({ data: { username: "a1", full_name: "Author" }, error: null }),
      ch({ data: { content: "Post body" }, error: null }),
    );

    await POST(makePostRequest(POST_ID, { content: "Own reply", parent_id: COMMENT_1 }), makeParams(POST_ID));
    await new Promise((r) => setTimeout(r, 100));

    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
