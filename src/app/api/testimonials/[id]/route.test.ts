import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "./route";

const mocks = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockFrom: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: mocks.mockGetAuthContext,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: mocks.mockFrom,
  }),
}));

function makeRequest(rating: number) {
  return new NextRequest("http://localhost/api/testimonials/testimonial-1", {
    method: "PATCH",
    body: JSON.stringify({ rating }),
    headers: { "Content-Type": "application/json" },
  });
}

describe("PATCH /api/testimonials/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetAuthContext.mockResolvedValue({
      user: { id: "author-1" },
      supabase: {},
    });
    mocks.mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: {
                id: "testimonial-1",
                profile_id: "profile-1",
                gig_id: null,
                author_id: "author-1",
              },
              error: null,
            }),
        }),
      }),
      update: mocks.mockUpdate,
    });
  });

  it("rejects fractional ratings before updating the testimonial", async () => {
    const response = await PATCH(makeRequest(4.5), {
      params: Promise.resolve({ id: "testimonial-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Rating must be an integer from 1-5");
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });
});
