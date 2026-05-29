import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}));

import { GET } from "./route";

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/users/alice/feed");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url.toString(), { method: "GET" });
}

function makeProfileChain() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { id: "user-1" },
      error: null,
    }),
  };
}

function makeListChain(data: unknown[] = []) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data }),
    in: vi.fn().mockResolvedValue({ data }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/users/[username]/feed", () => {
  it("defaults invalid pagination params before applying ranges", async () => {
    const profileChain = makeProfileChain();
    const postsChain = makeListChain([]);
    const commentsChain = makeListChain([]);
    mockFrom
      .mockReturnValueOnce(profileChain)
      .mockReturnValueOnce(postsChain)
      .mockReturnValueOnce(commentsChain);

    const res = await GET(makeRequest({ limit: "abc", offset: "-10" }), {
      params: Promise.resolve({ username: "alice" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(postsChain.range).toHaveBeenCalledWith(0, 19);
    expect(commentsChain.range).toHaveBeenCalledWith(0, 19);
    expect(body.pagination).toEqual({ total: 0, limit: 20, offset: 0 });
  });

  it("truncates fractional params and caps high limits", async () => {
    const profileChain = makeProfileChain();
    const postsChain = makeListChain([]);
    const commentsChain = makeListChain([]);
    mockFrom
      .mockReturnValueOnce(profileChain)
      .mockReturnValueOnce(postsChain)
      .mockReturnValueOnce(commentsChain);

    const res = await GET(makeRequest({ limit: "250.7", offset: "3.9" }), {
      params: Promise.resolve({ username: "alice" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(postsChain.range).toHaveBeenCalledWith(0, 52);
    expect(commentsChain.range).toHaveBeenCalledWith(0, 52);
    expect(body.pagination).toEqual({ total: 0, limit: 50, offset: 3 });
  });

  it("clamps zero limits to the minimum page size", async () => {
    const profileChain = makeProfileChain();
    const postsChain = makeListChain([]);
    const commentsChain = makeListChain([]);
    mockFrom
      .mockReturnValueOnce(profileChain)
      .mockReturnValueOnce(postsChain)
      .mockReturnValueOnce(commentsChain);

    const res = await GET(makeRequest({ limit: "0", offset: "" }), {
      params: Promise.resolve({ username: "alice" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(postsChain.range).toHaveBeenCalledWith(0, 0);
    expect(commentsChain.range).toHaveBeenCalledWith(0, 0);
    expect(body.pagination).toEqual({ total: 0, limit: 1, offset: 0 });
  });
});
