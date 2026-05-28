// @ts-nocheck - Supabase route mocks are intentionally minimal.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const mockFrom = vi.fn();

const supabaseClient = {
  from: mockFrom,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseClient)),
}));

const routeParams = { params: Promise.resolve({ username: "testuser" }) };

function makeRequest(query = "") {
  return new NextRequest(`http://localhost/api/users/testuser/activity${query}`);
}

function makeProfileChain(profile: { id: string } | null = { id: "user-1" }) {
  const single = vi.fn().mockResolvedValue({
    data: profile,
    error: profile ? null : { message: "not found" },
  });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });

  return { select, eq, single };
}

function makeActivitiesChain() {
  const range = vi.fn().mockResolvedValue({
    data: [{ id: "activity-1" }],
    error: null,
    count: 1,
  });
  const order = vi.fn().mockReturnValue({ range });
  const isPublicEq = vi.fn().mockReturnValue({ order });
  const userEq = vi.fn().mockReturnValue({ eq: isPublicEq });
  const select = vi.fn().mockReturnValue({ eq: userEq });

  return { select, userEq, isPublicEq, order, range };
}

function mockActivityRequest(profile = { id: "user-1" }) {
  const profileChain = makeProfileChain(profile);
  const activitiesChain = makeActivitiesChain();

  mockFrom.mockImplementation((table: string) =>
    table === "profiles" ? profileChain : activitiesChain
  );

  return { profileChain, activitiesChain };
}

describe("GET /api/users/:username/activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when the profile is missing", async () => {
    mockActivityRequest(null);

    const res = await GET(makeRequest(), routeParams);

    expect(res.status).toBe(404);
  });

  it("clamps invalid pagination values before querying", async () => {
    const { activitiesChain } = mockActivityRequest();

    const res = await GET(makeRequest("?limit=0&offset=-5"), routeParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(activitiesChain.range).toHaveBeenCalledWith(0, 19);
    expect(body.pagination).toEqual({
      total: 1,
      limit: 20,
      offset: 0,
    });
  });

  it("caps large limits at 50", async () => {
    const { activitiesChain } = mockActivityRequest();

    const res = await GET(makeRequest("?limit=500&offset=10"), routeParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(activitiesChain.range).toHaveBeenCalledWith(10, 59);
    expect(body.pagination.limit).toBe(50);
    expect(body.pagination.offset).toBe(10);
  });

  it("uses valid pagination values as provided", async () => {
    const { activitiesChain } = mockActivityRequest();

    const res = await GET(makeRequest("?limit=12&offset=24"), routeParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(activitiesChain.range).toHaveBeenCalledWith(24, 35);
    expect(body.pagination).toEqual({
      total: 1,
      limit: 12,
      offset: 24,
    });
  });
});
