// Gig boosting rules, shared between the API route and the UI so eligibility
// is computed identically in both places.

/** A gig must be at least this old (since creation or its last boost) to boost again. */
export const BOOST_COOLDOWN_DAYS = 7;

const COOLDOWN_MS = BOOST_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

interface BoostableGig {
  created_at?: string | null;
  boosted_at?: string | null;
}

export interface BoostEligibility {
  eligible: boolean;
  /** ISO timestamp when the gig becomes boostable again, or null if already eligible. */
  nextEligibleAt: string | null;
}

/**
 * A gig can be boosted once at least BOOST_COOLDOWN_DAYS have passed since it was
 * created or last boosted (whichever is more recent).
 */
export function getBoostEligibility(
  gig: BoostableGig,
  now: Date = new Date()
): BoostEligibility {
  const reference = gig.boosted_at ?? gig.created_at;
  if (!reference) {
    // No timestamp to reason about — treat as eligible rather than locking it forever.
    return { eligible: true, nextEligibleAt: null };
  }

  const referenceMs = new Date(reference).getTime();
  if (!Number.isFinite(referenceMs)) {
    return { eligible: true, nextEligibleAt: null };
  }

  const nextEligibleMs = referenceMs + COOLDOWN_MS;
  if (now.getTime() >= nextEligibleMs) {
    return { eligible: true, nextEligibleAt: null };
  }

  return {
    eligible: false,
    nextEligibleAt: new Date(nextEligibleMs).toISOString(),
  };
}
