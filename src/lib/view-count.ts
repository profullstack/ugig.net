/**
 * Counting a gig view.
 *
 * Views go through the `increment_gig_views` SECURITY DEFINER function, which
 * skips the gig's own poster. A plain `update gigs set views_count` as the
 * viewer is refused by RLS for anyone but the poster, and that is how views sat
 * at zero for every listing that only strangers looked at.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// Search crawlers, link unfurlers and uptime checks. HTTP libraries (curl,
// python-requests, ...) are deliberately NOT here: on ugig the buyers are often
// agents reading GET /api/gigs/{id}, and those are real views.
const BOT_UA =
  /bot\b|bot\/|crawler|spider|slurp|facebookexternalhit|embedly|preview|headlesschrome|lighthouse|pingdom|uptime|monitor/i;

export function isLikelyBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  return BOT_UA.test(userAgent);
}

/** Count one view of a gig. Never throws: a view count must not break a page. */
export async function recordGigView(
  supabase: SupabaseClient,
  gigId: string,
  userAgent: string | null | undefined
): Promise<boolean> {
  if (isLikelyBot(userAgent)) return false;
  try {
    const { error } = await supabase.rpc("increment_gig_views", { gig_id: gigId });
    if (error) {
      console.error("[gig views] increment failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[gig views] increment threw:", err);
    return false;
  }
}
