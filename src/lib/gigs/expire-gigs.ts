import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, gigExpiredEmail } from "@/lib/email";
import { isEmailNotificationEnabled } from "@/lib/notification-settings";
import { expiryDaysFor } from "@/lib/limits";

/** Gigs handled per cron run; the next run picks up the rest. */
export const EXPIRE_GIGS_BATCH = 200;

type ExpiringGig = {
  id: string;
  title: string | null;
  poster_id: string;
  listing_type: string | null;
  applications_count: number | null;
  expires_at: string | null;
  poster: { full_name: string | null; username: string | null } | { full_name: string | null; username: string | null }[] | null;
};

export type ExpireGigsResult = {
  dry_run: boolean;
  found: number;
  paused: number;
  emailed: number;
  email_skipped: number;
  email_failed: number;
  gigs: { id: string; listing_type: string | null; expires_at: string | null }[];
};

/**
 * Pause every active gig whose expires_at has passed and email its poster
 * once (PRD 01 req 3, PRD 03 req 3).
 *
 * "Once" holds because only the active -> paused transition sends: the update
 * is conditional on the gig still being active and past its date, so two
 * overlapping runs cannot both pause (and mail) the same gig, and a renewed
 * gig has a fresh expires_at. The email is gated on email_gig_updates.
 *
 * With dryRun nothing is written and nothing is sent.
 */
export async function expireGigs(
  supabase: SupabaseClient,
  options: { dryRun?: boolean; now?: Date; limit?: number } = {}
): Promise<ExpireGigsResult> {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const dryRun = options.dryRun ?? false;

  const { data, error } = await supabase
    .from("gigs")
    .select(
      "id, title, poster_id, listing_type, applications_count, expires_at, poster:profiles!poster_id(full_name, username)"
    )
    .eq("status", "active")
    .lt("expires_at", nowIso)
    .order("expires_at", { ascending: true })
    .limit(options.limit ?? EXPIRE_GIGS_BATCH);
  if (error) throw new Error(error.message);

  const gigs = (data ?? []) as ExpiringGig[];
  const result: ExpireGigsResult = {
    dry_run: dryRun,
    found: gigs.length,
    paused: 0,
    emailed: 0,
    email_skipped: 0,
    email_failed: 0,
    gigs: gigs.map((g) => ({ id: g.id, listing_type: g.listing_type, expires_at: g.expires_at })),
  };
  if (dryRun) return result;

  for (const gig of gigs) {
    const { data: paused, error: pauseError } = await supabase
      .from("gigs")
      .update({ status: "paused", updated_at: nowIso })
      .eq("id", gig.id)
      .eq("status", "active")
      .lt("expires_at", nowIso)
      .select("id");
    if (pauseError) {
      console.error(`[expire-gigs] pause failed for ${gig.id}:`, pauseError.message);
      continue;
    }
    if (!paused || paused.length === 0) continue; // renewed or changed meanwhile
    result.paused++;

    if (!(await isEmailNotificationEnabled(supabase, gig.poster_id, "email_gig_updates"))) {
      result.email_skipped++;
      continue;
    }

    const { data: authData } = await supabase.auth.admin.getUserById(gig.poster_id);
    const to = authData?.user?.email;
    if (!to) {
      result.email_skipped++;
      continue;
    }

    const poster = Array.isArray(gig.poster) ? gig.poster[0] : gig.poster;
    const sent = await sendEmail({
      to,
      ...gigExpiredEmail({
        posterName: poster?.full_name || poster?.username || "there",
        gigTitle: gig.title || "Your gig",
        gigId: gig.id,
        applicantCount: gig.applications_count ?? 0,
        renewDays: expiryDaysFor(gig.listing_type),
      }),
      unsubscribe: { userId: gig.poster_id, setting: "email_gig_updates" },
    });
    if (sent && (sent as { success?: boolean }).success === false) {
      result.email_failed++;
    } else {
      result.emailed++;
    }
  }

  return result;
}
