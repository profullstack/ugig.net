import { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";

type AnySupabase = any;

async function getAttributionWindowStart(admin: SupabaseClient, offerId: string): Promise<string> {
  const { data: offer } = await (admin as AnySupabase)
    .from("affiliate_offers")
    .select("cookie_days")
    .eq("id", offerId)
    .single();

  const cookieDays = offer?.cookie_days || 30;
  return new Date(Date.now() - cookieDays * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Generate a unique tracking code for an affiliate+offer pair.
 */
export function generateTrackingCode(username: string, offerSlug: string): string {
  const base = `${username}-${offerSlug}`;
  const hash = crypto
    .createHash("sha256")
    .update(base + Date.now())
    .digest("hex")
    .slice(0, 6);
  return `${username}-${hash}`;
}

/**
 * Hash an IP address for dedup without storing raw IPs.
 */
export function hashIP(ip: string): string {
  // Daily rotation salt so we can't permanently track IPs
  const daySalt = new Date().toISOString().slice(0, 10);
  return crypto.createHash("sha256").update(`${ip}:${daySalt}`).digest("hex").slice(0, 16);
}

/**
 * Record a click from an affiliate tracking link.
 */
export async function recordClick(
  admin: SupabaseClient,
  params: {
    trackingCode: string;
    visitorId?: string;
    ip?: string;
    userAgent?: string;
    referer?: string;
    landedUrl?: string;
  }
): Promise<{ ok: boolean; click_id?: string; offer_id?: string; error?: string }> {
  const { trackingCode, visitorId, ip, userAgent, referer, landedUrl } = params;

  // Look up the application by tracking code
  const { data: app, error: appErr } = await (admin as AnySupabase)
    .from("affiliate_applications")
    .select("id, offer_id, affiliate_id, status")
    .eq("tracking_code", trackingCode)
    .single();

  if (appErr || !app) {
    return { ok: false, error: "Invalid tracking code" };
  }

  if (app.status !== "approved") {
    return { ok: false, error: "Affiliate not approved" };
  }

  const ipHash = ip ? hashIP(ip) : null;

  // Deduplicate by visitorId + trackingCode within 24 hours
  if (visitorId) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await (admin as AnySupabase)
      .from("affiliate_clicks")
      .select("id", { count: "exact", head: true })
      .eq("tracking_code", trackingCode)
      .eq("visitor_id", visitorId)
      .gte("created_at", oneDayAgo);

    if ((count ?? 0) > 0) {
      // Deduplicated — same visitor already clicked this link within 24h
      return { ok: true, offer_id: app.offer_id };
    }
  }

  // Rate limit: max 1 click per IP per offer per hour (fallback when no visitorId)
  if (ipHash && !visitorId) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await (admin as AnySupabase)
      .from("affiliate_clicks")
      .select("id", { count: "exact", head: true })
      .eq("offer_id", app.offer_id)
      .eq("ip_hash", ipHash)
      .gte("created_at", oneHourAgo);

    if ((count ?? 0) > 0) {
      // Deduplicated — still return ok but don't create a new click
      return { ok: true, offer_id: app.offer_id };
    }
  }

  // Insert click
  const { data: click, error: clickErr } = await (admin as AnySupabase)
    .from("affiliate_clicks")
    .insert({
      offer_id: app.offer_id,
      affiliate_id: app.affiliate_id,
      tracking_code: trackingCode,
      visitor_id: visitorId || null,
      ip_hash: ipHash,
      user_agent: userAgent?.slice(0, 500) || null,
      referer: referer?.slice(0, 2000) || null,
      landed_url: landedUrl?.slice(0, 2000) || null,
    })
    .select("id")
    .single();

  if (clickErr) {
    console.error("Failed to record click:", clickErr);
    return { ok: false, error: clickErr.message };
  }

  // Increment offer click count
  try {
    const { data: offer } = await (admin as AnySupabase)
      .from("affiliate_offers")
      .select("total_clicks")
      .eq("id", app.offer_id)
      .single();

    if (offer) {
      await (admin as AnySupabase)
        .from("affiliate_offers")
        .update({
          total_clicks: (offer.total_clicks || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", app.offer_id);
    }
  } catch {
    console.warn("Failed to increment click count");
  }

  return { ok: true, click_id: click.id, offer_id: app.offer_id };
}

/**
 * Look up attribution: find which affiliate referred a buyer.
 * Checks the cookie window (cookie_days on the offer).
 */
export async function findAttribution(
  admin: SupabaseClient,
  params: {
    offerId: string;
    trackingCode?: string;
    visitorId?: string;
    buyerId?: string;
  }
): Promise<{
  affiliated: boolean;
  affiliate_id?: string;
  click_id?: string;
  tracking_code?: string;
} | null> {
  const { offerId, trackingCode, visitorId, buyerId } = params;

  // Fast path: if we have a tracking code, look up the affiliate directly
  if (trackingCode) {
    const { data: app } = await (admin as AnySupabase)
      .from("affiliate_applications")
      .select("affiliate_id, tracking_code, status")
      .eq("tracking_code", trackingCode)
      .eq("offer_id", offerId)
      .eq("status", "approved")
      .single();

    if (app) {
      const windowStart = await getAttributionWindowStart(admin, offerId);

      // Require a real click inside the offer's attribution window. When the
      // caller has a visitor id, the click must belong to that same visitor.
      let clickQuery = (admin as AnySupabase)
        .from("affiliate_clicks")
        .select("id")
        .eq("tracking_code", trackingCode)
        .eq("offer_id", offerId)
        .gte("created_at", windowStart)
        .order("created_at", { ascending: false });

      if (visitorId) {
        clickQuery = clickQuery.eq("visitor_id", visitorId);
      }

      const { data: clicks } = await clickQuery.limit(1);

      if (!clicks || clicks.length === 0) {
        return { affiliated: false };
      }

      return {
        affiliated: true,
        affiliate_id: app.affiliate_id,
        click_id: clicks[0].id,
        tracking_code: app.tracking_code,
      };
    }
  }

  if (!visitorId) return null;

  // Fallback: search by visitor_id within cookie window
  const windowStart = await getAttributionWindowStart(admin, offerId);

  let query = (admin as AnySupabase)
    .from("affiliate_clicks")
    .select("id, affiliate_id, tracking_code")
    .eq("offer_id", offerId)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false });

  if (visitorId) {
    query = query.eq("visitor_id", visitorId);
  }

  const { data: clicks } = await query.limit(1);

  if (clicks && clicks.length > 0) {
    return {
      affiliated: true,
      affiliate_id: clicks[0].affiliate_id,
      click_id: clicks[0].id,
      tracking_code: clicks[0].tracking_code,
    };
  }

  return { affiliated: false };
}
