import type { SupabaseClient } from "@supabase/supabase-js";
import { HIRED_APPLICATION_STATUSES } from "@/lib/application-status";
import { usersAreBlocked } from "@/lib/blocks";

/**
 * `reviews` is the single source of truth for star ratings: profile stars,
 * GET /api/users/:username/reviews, the leaderboard and auto-verification all
 * read it (and the `update_profile_rating` trigger keeps profiles.average_rating
 * in step with it). A gig testimonial is the optional public quote; its star
 * rating is copied into the matching `reviews` row here so it counts
 * everywhere without a second rating source to average in.
 *
 * Rules match POST /api/reviews: both the author and the reviewee must be the
 * gig's poster or a hired applicant, nobody reviews themselves, and a block in
 * either direction stops it. The reviewee is `profileId` when given (poster
 * reviewing a worker), otherwise the gig poster (worker reviewing the poster).
 *
 * Upsert semantics: one review per (gig, reviewer, reviewee). If one exists,
 * its rating and comment are updated to the testimonial's; otherwise one is
 * inserted. A failure never fails the testimonial: it is logged and reported
 * as not synced.
 */

export interface TestimonialForReview {
  gigId: string | null | undefined;
  authorId: string;
  profileId: string | null | undefined;
  rating: number;
  content: string | null | undefined;
}

export type SyncResult =
  | { synced: true; created: boolean; revieweeId: string; reviewId: string }
  | { synced: false; reason: string };

type Client = SupabaseClient<any>;

async function isHired(client: Client, gigId: string, userId: string): Promise<boolean> {
  const { data } = await client
    .from("applications")
    .select("id")
    .eq("gig_id", gigId)
    .eq("applicant_id", userId)
    .in("status", HIRED_APPLICATION_STATUSES as unknown as string[])
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * @param client a service-role client: the reviewer may not be able to read
 *   the other side's application under RLS.
 */
export async function syncTestimonialToReview(
  client: Client,
  t: TestimonialForReview
): Promise<SyncResult> {
  try {
    if (!t.gigId) return { synced: false, reason: "not a gig testimonial" };
    if (!Number.isInteger(t.rating) || t.rating < 1 || t.rating > 5) {
      return { synced: false, reason: "no valid rating" };
    }

    const { data: gig } = await client
      .from("gigs")
      .select("id, poster_id")
      .eq("id", t.gigId)
      .maybeSingle();
    if (!gig || !gig.poster_id) return { synced: false, reason: "gig not found" };

    const revieweeId: string = t.profileId || gig.poster_id;
    if (revieweeId === t.authorId) return { synced: false, reason: "self review" };

    const authorInvolved =
      gig.poster_id === t.authorId || (await isHired(client, t.gigId, t.authorId));
    if (!authorInvolved) return { synced: false, reason: "author not involved" };

    const revieweeInvolved =
      gig.poster_id === revieweeId || (await isHired(client, t.gigId, revieweeId));
    if (!revieweeInvolved) return { synced: false, reason: "reviewee not involved" };

    if (await usersAreBlocked(client, t.authorId, revieweeId)) {
      return { synced: false, reason: "blocked" };
    }

    const comment = t.content?.trim() ? t.content.trim().slice(0, 2000) : null;

    const { data: existing } = await client
      .from("reviews")
      .select("id")
      .eq("gig_id", t.gigId)
      .eq("reviewer_id", t.authorId)
      .eq("reviewee_id", revieweeId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { error } = await client
        .from("reviews")
        .update({ rating: t.rating, comment })
        .eq("id", existing.id);
      if (error) return { synced: false, reason: error.message };
      return { synced: true, created: false, revieweeId, reviewId: existing.id };
    }

    const { data: inserted, error } = await client
      .from("reviews")
      .insert({
        gig_id: t.gigId,
        reviewer_id: t.authorId,
        reviewee_id: revieweeId,
        rating: t.rating,
        comment,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      return { synced: false, reason: error?.message || "insert failed" };
    }
    return { synced: true, created: true, revieweeId, reviewId: inserted.id };
  } catch (err) {
    console.error("[syncTestimonialToReview] failed:", err);
    return { synced: false, reason: "unexpected error" };
  }
}
