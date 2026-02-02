import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Auto-verification criteria:
 * 1. Completed 3+ gigs (accepted applications on filled gigs)
 * 2. Average rating >= 4.0
 * 3. Account age >= 7 days
 */

export interface VerificationCheckResult {
  eligible: boolean;
  criteria: {
    completedGigs: { met: boolean; value: number; required: number };
    averageRating: { met: boolean; value: number | null; required: number };
    accountAge: { met: boolean; value: number; required: number };
  };
  alreadyVerified: boolean;
}

const REQUIRED_COMPLETED_GIGS = 3;
const REQUIRED_AVERAGE_RATING = 4.0;
const REQUIRED_ACCOUNT_AGE_DAYS = 7;

export async function checkAutoVerification(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<VerificationCheckResult> {
  // Fetch profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, verified, created_at")
    .eq("id", userId)
    .single();

  if (!profile) {
    throw new Error("Profile not found");
  }

  // Already verified
  if (profile.verified) {
    return {
      eligible: false,
      criteria: {
        completedGigs: { met: true, value: 0, required: REQUIRED_COMPLETED_GIGS },
        averageRating: { met: true, value: null, required: REQUIRED_AVERAGE_RATING },
        accountAge: { met: true, value: 0, required: REQUIRED_ACCOUNT_AGE_DAYS },
      },
      alreadyVerified: true,
    };
  }

  // 1. Check completed gigs — accepted applications on filled gigs
  const { count: completedGigsCount } = await supabase
    .from("applications")
    .select("id, gig:gigs!inner(status)", { count: "exact", head: true })
    .eq("applicant_id", userId)
    .eq("status", "accepted")
    .eq("gig.status", "filled");

  const completedGigs = completedGigsCount ?? 0;

  // 2. Check average rating
  const { data: reviews } = await supabase
    .from("reviews")
    .select("rating")
    .eq("reviewee_id", userId);

  const avgRating =
    reviews && reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null;

  // 3. Check account age
  const accountCreated = new Date(profile.created_at);
  const now = new Date();
  const accountAgeDays = Math.floor(
    (now.getTime() - accountCreated.getTime()) / (1000 * 60 * 60 * 24)
  );

  const criteria = {
    completedGigs: {
      met: completedGigs >= REQUIRED_COMPLETED_GIGS,
      value: completedGigs,
      required: REQUIRED_COMPLETED_GIGS,
    },
    averageRating: {
      met: avgRating !== null && avgRating >= REQUIRED_AVERAGE_RATING,
      value: avgRating,
      required: REQUIRED_AVERAGE_RATING,
    },
    accountAge: {
      met: accountAgeDays >= REQUIRED_ACCOUNT_AGE_DAYS,
      value: accountAgeDays,
      required: REQUIRED_ACCOUNT_AGE_DAYS,
    },
  };

  const eligible =
    criteria.completedGigs.met &&
    criteria.averageRating.met &&
    criteria.accountAge.met;

  return { eligible, criteria, alreadyVerified: false };
}

/**
 * Auto-verify a user if they meet all criteria.
 * Returns true if the user was verified, false otherwise.
 */
export async function autoVerifyUser(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ verified: boolean; result: VerificationCheckResult }> {
  const result = await checkAutoVerification(supabase, userId);

  if (result.eligible) {
    const { error } = await supabase
      .from("profiles")
      .update({
        verified: true,
        verified_at: new Date().toISOString(),
        verification_type: "auto",
      })
      .eq("id", userId);

    if (error) {
      throw new Error(`Failed to update verification: ${error.message}`);
    }

    return { verified: true, result };
  }

  return { verified: false, result };
}
