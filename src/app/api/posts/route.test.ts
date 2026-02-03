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

import { POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";

const mockGetAuthContext = vi.mocked(getAuthContext);

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function chainResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ["select", "insert", "eq", "single", "order", "range"]) {
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
//  POST /api/posts
// ════════════════════════════════════════════════════════════════════

describe("POST /api/posts", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await POST(makeRequest({ content: "Hello" }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 400 when content is missing", async () => {
    mockAuth();
    const res = await POST(makeRequest({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it("returns 400 when content is empty", async () => {
    mockAuth();
    const res = await POST(makeRequest({ content: "" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it("creates a text post successfully", async () => {
    mockAuth();
    const postData = {
      id: "post-1",
      content: "Hello world",
      url: null,
      post_type: "text",
      tags: [],
      author: { id: "user-1", username: "testuser" },
    };

    const chain = chainResult({ data: postData, error: null });
    mockFrom.mockReturnValue(chain);

    const res = await POST(makeRequest({ content: "Hello world" }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.post).toEqual(postData);
    expect(mockFrom).toHaveBeenCalledWith("posts");
  });

  it("creates a link post when url is provided", async () => {
    mockAuth();
    const postData = {
      id: "post-2",
      content: "Check this out",
      url: "https://example.com",
      post_type: "link",
      tags: ["tech"],
      author: { id: "user-1", username: "testuser" },
    };

    const chain = chainResult({ data: postData, error: null });
    mockFrom.mockReturnValue(chain);

    const res = await POST(
      makeRequest({
        content: "Check this out",
        url: "https://example.com",
        tags: ["tech"],
      })
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.post).toEqual(postData);
  });

  it("returns 400 when url is invalid", async () => {
    mockAuth();
    const res = await POST(
      makeRequest({ content: "Hello", url: "not-a-url" })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it("returns 400 when tags exceed limit", async () => {
    mockAuth();
    const tooManyTags = Array.from({ length: 11 }, (_, i) => `tag${i}`);
    const res = await POST(
      makeRequest({ content: "Hello", tags: tooManyTags })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it("returns 400 on database insert error", async () => {
    mockAuth();
    const chain = chainResult({
      data: null,
      error: { message: "Insert failed" },
    });
    mockFrom.mockReturnValue(chain);

    const res = await POST(makeRequest({ content: "Hello" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Insert failed");
  });
});
