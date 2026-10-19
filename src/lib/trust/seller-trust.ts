/**
 * Trust signals on listings (2026-10-19, from agent-seller feedback: "no trust
 * signal for agent listings, show N delivered, X% on time").
 *
 * Counts come from the `seller_trust_stats` SQL function (definer, counts
 * only). Every number is a recorded event: a delivered job is a paid gig
 * invoice or a Buy-now order marked delivered. On time is only measurable for
 * Buy-now orders, which carry a deadline (the escrow expiry), so the rate is
 * left out until there are MIN_ON_TIME_SAMPLE of them. Zero history reads
 * "New seller"; a failed lookup shows nothing at all (unknown is not new).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Measured deliveries needed before an on-time percentage is shown. */
export const MIN_ON_TIME_SAMPLE = 3;

export interface SellerTrust {
  /** Distinct jobs delivered (paid invoices + delivered Buy-now orders). */
  delivered_count: number;
  /** Deliveries that had a deadline to check against. */
  on_time_measured: number;
  /** Of those, delivered by the deadline. */
  on_time_count: number;
  /** on_time_count / on_time_measured, 0-100, or null below MIN_ON_TIME_SAMPLE. */
  on_time_rate: number | null;
  /** Distinct jobs this user has paid for on ugig (as a poster or buyer). */
  paid_count: number;
  /** Has paid someone on ugig (or is manually verified). */
  verified_poster: boolean;
  /** No delivered work yet. */
  new_seller: boolean;
}

interface TrustRow {
  user_id: string;
  delivered_count: number | null;
  on_time_measured: number | null;
  on_time_count: number | null;
  paid_count: number | null;
}

export function toSellerTrust(row: TrustRow, manuallyVerified = false): SellerTrust {
  const delivered = Number(row.delivered_count) || 0;
  const measured = Number(row.on_time_measured) || 0;
  const onTime = Number(row.on_time_count) || 0;
  const paid = Number(row.paid_count) || 0;
  return {
    delivered_count: delivered,
    on_time_measured: measured,
    on_time_count: onTime,
    on_time_rate: measured >= MIN_ON_TIME_SAMPLE ? Math.round((onTime / measured) * 100) : null,
    paid_count: paid,
    verified_poster: paid > 0 || manuallyVerified,
    new_seller: delivered === 0,
  };
}

/** "New seller", "14 delivered", "14 delivered · 92% on time". */
export function sellerTrustLabel(trust: SellerTrust): string {
  if (trust.new_seller) return "New seller";
  const delivered = `${trust.delivered_count} delivered`;
  return trust.on_time_rate === null ? delivered : `${delivered} · ${trust.on_time_rate}% on time`;
}

/**
 * Trust stats for a set of users, keyed by user id. Never throws; a user
 * missing from the map is unknown (render nothing), not new.
 */
export async function fetchSellerTrust(
  supabase: SupabaseClient<any>,
  userIds: (string | null | undefined)[],
  manuallyVerified: Set<string> = new Set()
): Promise<Map<string, SellerTrust>> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  const out = new Map<string, SellerTrust>();
  if (ids.length === 0) return out;
  try {
    const { data, error } = await supabase.rpc("seller_trust_stats", { user_ids: ids });
    if (error) {
      console.error("[seller trust] lookup failed:", error.message);
      return out;
    }
    for (const row of (data || []) as TrustRow[]) {
      out.set(row.user_id, toSellerTrust(row, manuallyVerified.has(row.user_id)));
    }
  } catch (err) {
    console.error("[seller trust] lookup threw:", err);
  }
  return out;
}

type WithPoster = { poster_id?: string | null; poster?: unknown };

function posterOf(gig: WithPoster): Record<string, unknown> | null {
  const poster = Array.isArray(gig.poster) ? gig.poster[0] : gig.poster;
  return poster && typeof poster === "object" ? (poster as Record<string, unknown>) : null;
}

/**
 * Put `poster.trust` on each gig (in place, and returned). Gigs without an
 * embedded poster, or whose poster is unknown to the lookup, are left alone.
 */
export async function attachSellerTrust<T extends WithPoster>(
  supabase: SupabaseClient<any>,
  gigs: T[]
): Promise<T[]> {
  const posters = gigs.map(posterOf);
  const ids = gigs.map((g, i) => (posters[i]?.id as string | undefined) ?? g.poster_id ?? null);
  const verified = new Set(
    posters.filter((p) => p?.verified === true).map((p) => p!.id as string)
  );
  const trust = await fetchSellerTrust(supabase, ids, verified);
  gigs.forEach((gig, i) => {
    const poster = posters[i];
    const id = ids[i];
    if (!poster || !id) return;
    const t = trust.get(id);
    if (!t) return;
    if (Array.isArray(gig.poster)) {
      (gig.poster as unknown[])[0] = { ...poster, trust: t };
    } else {
      gig.poster = { ...poster, trust: t };
    }
  });
  return gigs;
}

/**
 * Users who have paid someone on ugig (or are manually verified): the hiring
 * board ranks their posts first. Empty on failure, which only loses the order.
 */
export async function fetchVerifiedPosterIds(supabase: SupabaseClient<any>): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc("verified_poster_ids");
    if (error) {
      console.error("[verified posters] lookup failed:", error.message);
      return [];
    }
    return ((data || []) as unknown[])
      .map((row) =>
        typeof row === "string" ? row : (row as Record<string, string>)?.verified_poster_ids
      )
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch (err) {
    console.error("[verified posters] lookup threw:", err);
    return [];
  }
}
