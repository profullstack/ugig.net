import type { SupabaseClient } from "@supabase/supabase-js";
import { FREE_MONTHLY_GIG_POSTS, hasPaidAccess } from "@/lib/plans";

/**
 * Free accounts may publish FREE_MONTHLY_GIG_POSTS gigs per calendar month.
 * Every transition into `active` counts once: creating a gig as active,
 * publishing a draft, or re-activating a paused/closed gig. Hiring gigs and
 * for-hire ads count the same.
 *
 * Usage lives in gig_usage (user_id, month, year, posts_count).
 */

export const GIG_POST_LIMIT_MESSAGE = `You've reached your monthly limit of ${FREE_MONTHLY_GIG_POSTS} gig posts. Upgrade to Pro for unlimited posts.`;

export function currentUsagePeriod(now: Date = new Date()): { month: number; year: number } {
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export type GigPostAllowance =
  | { allowed: true; unlimited: true }
  | { allowed: boolean; unlimited: false; used: number; limit: number; remaining: number };

/** Can this user publish (activate) one more gig this month? */
export async function getGigPostAllowance(
  supabase: SupabaseClient<any>,
  userId: string,
  now: Date = new Date()
): Promise<GigPostAllowance> {
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan, status")
    .eq("user_id", userId)
    .maybeSingle();

  if (hasPaidAccess(subscription as { plan?: string; status?: string } | null)) {
    return { allowed: true, unlimited: true };
  }

  const { month, year } = currentUsagePeriod(now);
  const { data: usage } = await supabase
    .from("gig_usage")
    .select("posts_count")
    .eq("user_id", userId)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();

  const used = Number((usage as { posts_count?: number } | null)?.posts_count ?? 0);
  const remaining = Math.max(0, FREE_MONTHLY_GIG_POSTS - used);
  return {
    allowed: used < FREE_MONTHLY_GIG_POSTS,
    unlimited: false,
    used,
    limit: FREE_MONTHLY_GIG_POSTS,
    remaining,
  };
}

/**
 * Count one gig activation against this month's usage.
 *
 * The row is created with posts_count 0 only if missing (ignoreDuplicates, so
 * an existing count is never overwritten), then increment_gig_usage adds 1.
 * The previous code upserted posts_count: 1 and then incremented, which reset
 * every free account's counter to 2 on each post, so the cap never bit.
 *
 * Migration 20261006131000 makes increment_gig_usage create the row itself and
 * removes the user INSERT/UPDATE policies, after which the upsert below is
 * refused by RLS for session users. That is expected and harmless, so its
 * error is ignored; the RPC is the authoritative write.
 */
export async function recordGigPost(
  supabase: SupabaseClient<any>,
  userId: string,
  now: Date = new Date()
): Promise<void> {
  const { month, year } = currentUsagePeriod(now);

  await supabase.from("gig_usage").upsert(
    { user_id: userId, month, year, posts_count: 0 },
    { onConflict: "user_id,month,year", ignoreDuplicates: true }
  );

  const { error: rpcError } = await supabase.rpc("increment_gig_usage", {
    p_user_id: userId,
    p_month: month,
    p_year: year,
  });
  if (rpcError) {
    console.error("[gig-usage] failed to increment usage:", rpcError);
  }
}
