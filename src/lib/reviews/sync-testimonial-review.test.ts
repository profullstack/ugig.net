import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/blocks", () => ({ usersAreBlocked: vi.fn() }));

import { syncTestimonialToReview } from "./sync-testimonial-review";
import { usersAreBlocked } from "@/lib/blocks";

const GIG = "gig-1";
const POSTER = "poster";
const WORKER = "worker";

/**
 * Minimal fake of the query builder: gigs lookup, hired-application lookup,
 * existing-review lookup, review update and insert.
 */
function fakeClient({
  posterId = POSTER as string | null,
  hired = [WORKER] as string[],
  existingReviewId = null as string | null,
  insertError = null as { message: string } | null,
} = {}) {
  const inserted: unknown[] = [];
  const updated: unknown[] = [];

  const client = {
    from: vi.fn((table: string) => {
      const filters: Record<string, unknown> = {};
      const builder: any = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return builder;
        },
        in: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          if (table === "gigs") {
            return { data: posterId === null ? null : { id: GIG, poster_id: posterId } };
          }
          if (table === "applications") {
            return { data: hired.includes(filters.applicant_id as string) ? { id: "app" } : null };
          }
          if (table === "reviews") {
            return { data: existingReviewId ? { id: existingReviewId } : null };
          }
          return { data: null };
        },
        update: (row: unknown) => {
          updated.push(row);
          return { eq: async () => ({ error: null }) };
        },
        insert: (row: unknown) => {
          inserted.push(row);
          return {
            select: () => ({
              single: async () =>
                insertError ? { data: null, error: insertError } : { data: { id: "new-review" }, error: null },
            }),
          };
        },
      };
      return builder;
    }),
  };
  return { client: client as any, inserted, updated };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(usersAreBlocked).mockResolvedValue(false);
});

describe("syncTestimonialToReview", () => {
  it("creates a review when the poster gives a hired worker a gig testimonial", async () => {
    const { client, inserted } = fakeClient();
    const res = await syncTestimonialToReview(client, {
      gigId: GIG,
      authorId: POSTER,
      profileId: WORKER,
      rating: 4,
      content: "  Great work  ",
    });
    expect(res).toEqual({ synced: true, created: true, revieweeId: WORKER, reviewId: "new-review" });
    expect(inserted).toEqual([
      { gig_id: GIG, reviewer_id: POSTER, reviewee_id: WORKER, rating: 4, comment: "Great work" },
    ]);
  });

  it("reviews the poster when a hired worker leaves a gig testimonial with no profile", async () => {
    const { client, inserted } = fakeClient();
    const res = await syncTestimonialToReview(client, {
      gigId: GIG,
      authorId: WORKER,
      profileId: null,
      rating: 5,
      content: "Clear brief",
    });
    expect(res).toMatchObject({ synced: true, revieweeId: POSTER });
    expect(inserted[0]).toMatchObject({ reviewer_id: WORKER, reviewee_id: POSTER, rating: 5 });
  });

  it("updates the existing review's stars instead of adding a second one", async () => {
    const { client, inserted, updated } = fakeClient({ existingReviewId: "r-1" });
    const res = await syncTestimonialToReview(client, {
      gigId: GIG,
      authorId: POSTER,
      profileId: WORKER,
      rating: 2,
      content: "Late",
    });
    expect(res).toEqual({ synced: true, created: false, revieweeId: WORKER, reviewId: "r-1" });
    expect(inserted).toHaveLength(0);
    expect(updated).toEqual([{ rating: 2, comment: "Late" }]);
  });

  it("skips a testimonial that is not tied to a gig", async () => {
    const { client, inserted } = fakeClient();
    const res = await syncTestimonialToReview(client, {
      gigId: null,
      authorId: POSTER,
      profileId: WORKER,
      rating: 5,
      content: "x",
    });
    expect(res.synced).toBe(false);
    expect(inserted).toHaveLength(0);
  });

  it("skips an author who was not involved in the gig", async () => {
    const { client, inserted } = fakeClient();
    const res = await syncTestimonialToReview(client, {
      gigId: GIG,
      authorId: "stranger",
      profileId: null,
      rating: 1,
      content: "x",
    });
    expect(res).toEqual({ synced: false, reason: "author not involved" });
    expect(inserted).toHaveLength(0);
  });

  it("skips a reviewee who was not hired on the gig", async () => {
    const { client } = fakeClient({ hired: [] });
    const res = await syncTestimonialToReview(client, {
      gigId: GIG,
      authorId: POSTER,
      profileId: "applicant-not-hired",
      rating: 5,
      content: "x",
    });
    expect(res).toEqual({ synced: false, reason: "reviewee not involved" });
  });

  it("skips when either side has blocked the other", async () => {
    vi.mocked(usersAreBlocked).mockResolvedValue(true);
    const { client, inserted } = fakeClient();
    const res = await syncTestimonialToReview(client, {
      gigId: GIG,
      authorId: POSTER,
      profileId: WORKER,
      rating: 5,
      content: "x",
    });
    expect(res).toEqual({ synced: false, reason: "blocked" });
    expect(inserted).toHaveLength(0);
  });

  it("reports, but does not throw, when the insert fails", async () => {
    const { client } = fakeClient({ insertError: { message: "duplicate key" } });
    const res = await syncTestimonialToReview(client, {
      gigId: GIG,
      authorId: POSTER,
      profileId: WORKER,
      rating: 5,
      content: "x",
    });
    expect(res).toEqual({ synced: false, reason: "duplicate key" });
  });
});
