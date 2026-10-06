import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  sync: vi.fn(),
  testimonial: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/auth/get-user", () => ({ getAuthContext: mocks.getAuthContext }));
vi.mock("@/lib/reviews/sync-testimonial-review", () => ({ syncTestimonialToReview: mocks.sync }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: mocks.testimonial, error: null }) }),
      }),
      update: (row: Record<string, unknown>) => ({
        eq: () => ({
          select: () => ({
            single: async () => ({
              data: { ...mocks.testimonial, content: "unchanged quote", ...row },
              error: null,
            }),
          }),
        }),
      }),
    }),
  }),
}));

import { PATCH } from "./route";

function patch(body: unknown) {
  return PATCH(
    new NextRequest("http://localhost/api/testimonials/t-1", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
    { params: Promise.resolve({ id: "t-1" }) }
  );
}

describe("PATCH /api/testimonials/[id] keeps the review in step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthContext.mockResolvedValue({ user: { id: "poster" }, supabase: {} });
    mocks.sync.mockResolvedValue({ synced: true, created: false, revieweeId: "worker", reviewId: "r-1" });
  });

  it("re-syncs the review's stars when the author edits a gig testimonial's rating", async () => {
    mocks.testimonial = { id: "t-1", profile_id: "worker", gig_id: "gig-1", author_id: "poster" };
    const res = await patch({ rating: 2 });
    expect(res.status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith(expect.anything(), {
      gigId: "gig-1",
      authorId: "poster",
      profileId: "worker",
      rating: 2,
      content: "unchanged quote",
    });
  });

  it("does nothing for a profile-only testimonial", async () => {
    mocks.testimonial = { id: "t-1", profile_id: "worker", gig_id: null, author_id: "poster" };
    const res = await patch({ rating: 2 });
    expect(res.status).toBe(200);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
});
