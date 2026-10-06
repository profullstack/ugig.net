/**
 * Who the current user can still review on a gig.
 *
 * - The poster reviews each hired worker (hired = HIRED_APPLICATION_STATUSES).
 * - A hired worker reviews the poster.
 * - Anyone else reviews nobody.
 * - A person drops off the list once this user has reviewed them for this
 *   gig (one review per gig, reviewer and reviewee; POST /api/reviews
 *   enforces the same rule).
 */

export interface ReviewTargetPerson {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
}

export function getReviewTargets({
  currentUserId,
  poster,
  hiredWorkers,
  reviewedIds,
}: {
  currentUserId: string | null | undefined;
  poster: ReviewTargetPerson | null | undefined;
  /** Profiles of every hired applicant on the gig. */
  hiredWorkers: ReviewTargetPerson[];
  /** Reviewee ids this user already reviewed on this gig. */
  reviewedIds: Iterable<string>;
}): ReviewTargetPerson[] {
  if (!currentUserId || !poster) return [];
  const reviewed = new Set(reviewedIds);

  let candidates: ReviewTargetPerson[] = [];
  if (currentUserId === poster.id) {
    candidates = hiredWorkers;
  } else if (hiredWorkers.some((w) => w.id === currentUserId)) {
    candidates = [poster];
  }

  const seen = new Set<string>();
  return candidates.filter((p) => {
    if (p.id === currentUserId || reviewed.has(p.id) || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}
