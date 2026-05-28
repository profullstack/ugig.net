// @ts-nocheck - Supabase route mocks are intentionally minimal.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

function makeRequest(query = "") {
  return new NextRequest(`http://localhost/api/activity${query}`);
}

function makeSupabase() {
  const range = vi.fn().mockResolvedValue({
    data: [{ id: "activity-1" }],
    error: null,
    count: 1,
  });
  const order = vi.fn().mockReturnValue({ range });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  return { supabase: { from }, range };
}

describe("GET /api/activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
  });

  it("clamps invalid pagination values before querying", async () => {
    const { supabase, range } = makeSupabase();
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1" },
      supabase,
    });

    const res = await GET(makeRequest("?limit=-10&offset=-5"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(range).toHaveBeenCalledWith(0, 19);
    expect(body.pagination).toEqual({
      total: 1,
      limit: 20,
      offset: 0,
    });
  });

  it("caps large limits at 50", async () => {
    const { supabase, range } = makeSupabase();
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1" },
      supabase,
    });

    const res = await GET(makeRequest("?limit=500&offset=10"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(range).toHaveBeenCalledWith(10, 59);
    expect(body.pagination.limit).toBe(50);
    expect(body.pagination.offset).toBe(10);
  });

  it("uses valid pagination values as provided", async () => {
    const { supabase, range } = makeSupabase();
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1" },
      supabase,
    });

    const res = await GET(makeRequest("?limit=12&offset=24"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(range).toHaveBeenCalledWith(24, 35);
    expect(body.pagination).toEqual({
      total: 1,
      limit: 12,
      offset: 24,
    });
  });
});
