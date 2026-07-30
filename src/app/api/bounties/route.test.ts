import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

import { GET, POST } from "./route";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/get-user";

function makeReq(url: string) {
  return { nextUrl: new URL(url) } as any;
}

function chain(result: { data: any; error?: any }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data: result.data, error: result.error ?? null }),
  };
}

describe("GET /api/bounties", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects non-positive limit with 400", async () => {
    const res = await GET(makeReq("http://localhost/api/bounties?limit=0&page=1"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid limit/i);
  });

  it("rejects non-positive page with 400", async () => {
    const res = await GET(makeReq("http://localhost/api/bounties?limit=50&page=-2"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid page/i);
  });

  it("caps limit at 100 and computes offset using page", async () => {
    const bountyChain = chain({ data: [] });
    (createClient as any).mockResolvedValue({
      from: vi.fn(() => bountyChain),
    });

    const res = await GET(makeReq("http://localhost/api/bounties?limit=101&page=2"));

    expect(res.status).toBe(200);
    expect(bountyChain.range).toHaveBeenCalledWith(100, 199);
  });

  it("rejects non-numeric limit/page with 400", async () => {
    const res = await GET(makeReq("http://localhost/api/bounties?limit=abc&page=def"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid limit/i);
  });
});

describe("POST /api/bounties", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 for malformed JSON without querying Supabase", async () => {
    const from = vi.fn();
    (getAuthContext as any).mockResolvedValue({
      user: { id: "user-1" },
      supabase: { from },
    });
    const request = {
      json: vi.fn().mockRejectedValue(new SyntaxError("Invalid JSON")),
    } as any;

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid JSON body",
    });
    expect(from).not.toHaveBeenCalled();
  });
});

