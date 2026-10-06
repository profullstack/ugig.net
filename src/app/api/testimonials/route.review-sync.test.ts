import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/get-user", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/blocks", () => ({
  usersAreBlocked: vi.fn().mockResolvedValue(false),
  getBlockedUserIds: vi.fn().mockResolvedValue([]),
  excludeBlocked: (q: unknown) => q,
}));
vi.mock("@/lib/reviews/sync-testimonial-review", () => ({ syncTestimonialToReview: vi.fn() }));

import { POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { syncTestimonialToReview } from "@/lib/reviews/sync-testimonial-review";

const POSTER = "11111111-1111-4111-8111-111111111111";
const WORKER = "22222222-2222-4222-8222-222222222222";
const GIG = "33333333-3333-4333-8333-333333333333";

function serviceClient() {
  const notificationInserts: unknown[] = [];
  const client = {
    from: vi.fn((table: string) => {
      if (table === "gigs") {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { poster_id: POSTER, title: "Logo" }, error: null }) }),
          }),
        };
      }
      if (table === "testimonials") {
        return {
          insert: () => ({
            select: () => ({ single: async () => ({ data: { id: "t-1" }, error: null }) }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { full_name: null, username: "poster" } }) }),
          }),
        };
      }
      if (table === "notifications") {
        return {
          insert: async (row: unknown) => {
            notificationInserts.push(row);
            return { error: null };
          },
        };
      }
      return {};
    }),
    auth: { admin: { getUserById: async () => ({ data: { user: null } }) } },
  };
  return { client, notificationInserts };
}

function req(body: unknown) {
  return {
    url: "http://localhost/api/testimonials",
    headers: new Headers(),
    json: async () => body,
  } as any;
}

describe("POST /api/testimonials -> reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getAuthContext as any).mockResolvedValue({ user: { id: POSTER }, supabase: {} });
  });

  it("copies the gig testimonial's rating into reviews and lets the review trigger notify", async () => {
    const { client, notificationInserts } = serviceClient();
    (createServiceClient as any).mockReturnValue(client);
    vi.mocked(syncTestimonialToReview).mockResolvedValue({
      synced: true,
      created: true,
      revieweeId: WORKER,
      reviewId: "r-1",
    });

    const res = await POST(req({ profile_id: WORKER, gig_id: GIG, rating: 4, content: "Solid work" }));

    expect(res.status).toBe(201);
    expect(syncTestimonialToReview).toHaveBeenCalledWith(client, {
      gigId: GIG,
      authorId: POSTER,
      profileId: WORKER,
      rating: 4,
      content: "Solid work",
    });
    // on_new_review already notified the worker; no second notification
    expect(notificationInserts).toHaveLength(0);
  });

  it("still notifies, with valid columns, when no review row was created", async () => {
    const { client, notificationInserts } = serviceClient();
    (createServiceClient as any).mockReturnValue(client);
    vi.mocked(syncTestimonialToReview).mockResolvedValue({ synced: false, reason: "author not involved" });

    const res = await POST(req({ profile_id: WORKER, gig_id: GIG, rating: 5, content: "Great" }));

    expect(res.status).toBe(201);
    expect(notificationInserts).toHaveLength(1);
    const row = notificationInserts[0] as Record<string, unknown>;
    expect(row).toMatchObject({ user_id: WORKER, type: "review_received", body: "Great" });
    // notifications has body/data, not message/link
    expect(row).not.toHaveProperty("message");
    expect(row).not.toHaveProperty("link");
  });
});
