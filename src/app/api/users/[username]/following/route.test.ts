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

function makeRequest(searchParams?: Record<string, string>) {
  let url = "http://localhost/api/users/testuser/following";
  if (searchParams) {
    url += `?${new URLSearchParams(searchParams).toString()}`;
  }
  return new NextRequest(url, { method: "GET" });
}

const routeParams = { params: Promise.resolve({ username: "testuser" }) };

function profileChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "single"]) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.single.mockResolvedValue(result);
  return chain;
}

function followsChain(result: { data: unknown[]; error: unknown; count: number }) {
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

describe("GET /api/users/[username]/following", () => {
  it("returns 404 when user is not found", async () => {
    mockFrom.mockReturnValue(profileChain({ data: null, error: { message: "not found" } }));

    const res = await GET(makeRequest(), routeParams);

    expect(res.status).toBe(404);
  });

  it("falls back for invalid pagination params", async () => {
    const targetProfile = profileChain({ data: { id: "user-123" }, error: null });
    const follows = followsChain({ data: [], error: null, count: 0 });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? targetProfile : follows;
    });

    const res = await GET(
      makeRequest({ limit: "-5", offset: "-10" }),
      routeParams
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(follows.range).toHaveBeenCalledWith(0, 19);
    expect(json.pagination.limit).toBe(20);
    expect(json.pagination.offset).toBe(0);
  });

  it("caps large limits", async () => {
    const targetProfile = profileChain({ data: { id: "user-123" }, error: null });
    const follows = followsChain({ data: [], error: null, count: 0 });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? targetProfile : follows;
    });

    await GET(makeRequest({ limit: "500", offset: "5" }), routeParams);

    expect(follows.range).toHaveBeenCalledWith(5, 104);
  });

  it("keeps valid pagination params", async () => {
    const targetProfile = profileChain({ data: { id: "user-123" }, error: null });
    const follows = followsChain({ data: [], error: null, count: 0 });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? targetProfile : follows;
    });

    await GET(makeRequest({ limit: "10", offset: "30" }), routeParams);

    expect(follows.range).toHaveBeenCalledWith(30, 39);
  });
});
