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
  return new NextRequest(`http://localhost/api/users/testuser/reviews${query}`);
}

function makeProfileChain(profile: { id: string } | null = { id: "user-1" }) {
  const single = vi.fn().mockResolvedValue({
    data: profile,
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });

  return { select, eq, single };
}

function makeReviewsChain() {
  const range = vi.fn().mockResolvedValue({
    data: [{ id: "review-1", rating: 5 }],
    error: null,
    count: 1,
  });
  const order = vi.fn().mockReturnValue({ range });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });

  return { select, eq, order, range };
}

function makeRatingsChain(ratings = [{ rating: 5 }]) {
  const eq = vi.fn().mockResolvedValue({
    data: ratings,
    error: null,
  });
  const select = vi.fn().mockReturnValue({ eq });

  return { select, eq };
}

function mockReviewsRequest(profile = { id: "user-1" }) {
  const profileChain = makeProfileChain(profile);
  const ratingsChain = makeRatingsChain([
    { rating: 5 },
    { rating: 3 },
  ]);
  const reviewsChain = makeReviewsChain();

  let reviewsCallCount = 0;
  mockFrom.mockImplementation((table: string) => {
    if (table === "profiles") return profileChain;

    reviewsCallCount++;
    return reviewsCallCount === 1 ? ratingsChain : reviewsChain;
  });

  return { profileChain, ratingsChain, reviewsChain };
}

describe("GET /api/users/[username]/reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when the profile is missing", async () => {
    mockReviewsRequest(null);

    const res = await GET(makeRequest(), routeParams);

    expect(res.status).toBe(404);
  });

  it("clamps invalid pagination values before querying", async () => {
    const { reviewsChain } = mockReviewsRequest();

    const res = await GET(makeRequest("?limit=0&offset=-5"), routeParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(reviewsChain.range).toHaveBeenCalledWith(0, 9);
    expect(body.pagination).toEqual({
      total: 1,
      limit: 10,
      offset: 0,
    });
    expect(body.summary.average_rating).toBe(4);
  });

  it("caps large limits at 50", async () => {
    const { reviewsChain } = mockReviewsRequest();

    const res = await GET(makeRequest("?limit=500&offset=10"), routeParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(reviewsChain.range).toHaveBeenCalledWith(10, 59);
    expect(body.pagination.limit).toBe(50);
    expect(body.pagination.offset).toBe(10);
  });

  it("uses valid pagination values as provided", async () => {
    const { reviewsChain } = mockReviewsRequest();

    const res = await GET(makeRequest("?limit=12&offset=24"), routeParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(reviewsChain.range).toHaveBeenCalledWith(24, 35);
    expect(body.pagination).toEqual({
      total: 1,
      limit: 12,
      offset: 24,
    });
  });
});
