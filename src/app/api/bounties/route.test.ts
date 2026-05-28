import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

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

function makeRequest(searchParams?: Record<string, string>) {
  let url = "http://localhost/api/bounties";
  if (searchParams) {
    url += `?${new URLSearchParams(searchParams).toString()}`;
  }
  return new NextRequest(url, { method: "GET" });
}

function bountyListChain(result = { data: [], error: null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "order", "range"]) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.range.mockResolvedValue(result);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/bounties", () => {
  it("falls back for invalid pagination params", async () => {
    const query = bountyListChain();
    mockFrom.mockReturnValue(query);

    const res = await GET(makeRequest({ limit: "0", page: "-2" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(query.range).toHaveBeenCalledWith(0, 49);
    expect(json.data).toEqual([]);
  });

  it("falls back for fractional pagination params", async () => {
    const query = bountyListChain();
    mockFrom.mockReturnValue(query);

    await GET(makeRequest({ limit: "1.9", page: "2.5" }));

    expect(query.range).toHaveBeenCalledWith(0, 49);
  });

  it("caps large limits", async () => {
    const query = bountyListChain();
    mockFrom.mockReturnValue(query);

    await GET(makeRequest({ limit: "500", page: "2" }));

    expect(query.range).toHaveBeenCalledWith(100, 199);
  });

  it("keeps valid pagination params", async () => {
    const query = bountyListChain();
    mockFrom.mockReturnValue(query);

    await GET(makeRequest({ limit: "25", page: "3" }));

    expect(query.range).toHaveBeenCalledWith(50, 74);
  });

  it("applies requested status filter", async () => {
    const query = bountyListChain();
    mockFrom.mockReturnValue(query);

    await GET(makeRequest({ status: "closed" }));

    expect(query.eq).toHaveBeenCalledWith("status", "closed");
  });
});
