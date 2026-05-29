import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { GET } from "./route";
import { createClient } from "@/lib/supabase/server";

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

  it("falls back to default limit when limit is non-positive", async () => {
    const bountyChain = chain({ data: [] });
    (createClient as any).mockResolvedValue({
      from: vi.fn(() => bountyChain),
    });

    const res = await GET(makeReq("http://localhost/api/bounties?limit=0&page=1"));

    expect(res.status).toBe(200);
    expect(bountyChain.range).toHaveBeenCalledWith(0, 49);
  });

  it("falls back to page 1 when page is invalid or non-positive", async () => {
    const bountyChain = chain({ data: [] });
    (createClient as any).mockResolvedValue({
      from: vi.fn(() => bountyChain),
    });

    const res = await GET(makeReq("http://localhost/api/bounties?limit=50&page=-2"));

    expect(res.status).toBe(200);
    expect(bountyChain.range).toHaveBeenCalledWith(0, 49);
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

  it("falls back to defaults when limit/page are non-numeric", async () => {
    const bountyChain = chain({ data: [] });
    (createClient as any).mockResolvedValue({
      from: vi.fn(() => bountyChain),
    });

    const res = await GET(makeReq("http://localhost/api/bounties?limit=abc&page=def"));

    expect(res.status).toBe(200);
    expect(bountyChain.range).toHaveBeenCalledWith(0, 49);
  });
});

