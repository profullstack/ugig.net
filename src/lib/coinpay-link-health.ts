import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/markdown-email";
import { COINPAY_CONNECT_PATH } from "@/lib/coinpay-reconnect";

type Client = SupabaseClient<any, "public", any>;

/**
 * A CoinPay link that has stopped working, and telling its owner once.
 *
 * Reported 2026-10-28 by a seller: they connected CoinPay, Buy now went live,
 * then the link stopped refreshing and Buy now quietly disappeared. Nothing
 * told the seller or the buyer; the listing looked normal and was unpayable.
 * So a dead link is now recorded on the identity (`link_error`), its owner
 * gets one email and one in-app notice per breakage, and buyers are told
 * payments are unavailable instead of seeing nothing.
 *
 * Reconnecting rewrites the identity's metadata wholesale (the OAuth
 * callback), which clears `link_error` and `reconnect_notified_at` together,
 * so a later breakage notifies again.
 */

export type CoinpayLinkFault = "refresh_rejected" | "no_refresh_token" | "missing_scope";

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** The recorded fault on a stored link, if any. */
export function coinpayLinkFault(metadata: unknown): CoinpayLinkFault | null {
  const error = metadataObject(metadataObject(metadata).link_error);
  return typeof error.code === "string" ? (error.code as CoinpayLinkFault) : null;
}

function appUrl(): string {
  for (const url of [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    if (url && !url.includes("localhost")) return url.replace(/\/+$/, "");
  }
  return "https://ugig.net";
}

/** Does this user sell anything Buy now could be used on? */
async function activeForHireListings(svc: Client, userId: string): Promise<{ id: string; title: string }[]> {
  const { data } = await svc
    .from("gigs")
    .select("id, title")
    .eq("poster_id", userId)
    .eq("listing_type", "for_hire")
    .eq("status", "active")
    .limit(5);
  return (data as { id: string; title: string }[] | null) ?? [];
}

export function reconnectNotice(listings: { id: string; title: string }[], base: string) {
  const url = `${base}${COINPAY_CONNECT_PATH}`;
  const title = "Reconnect CoinPay: buyers can't pay you through it";
  const body =
    "Your CoinPay connection on ugig stopped working, so Buy now on your listings and gig invoices " +
    "can't pay you through CoinPay. Reconnect it once in Settings > Connections. If you also saved a " +
    "payout wallet on your profile, Buy now keeps paying to that.";
  const list = listings.map((l) => `- ${l.title}: ${base}/gigs/${l.id}`).join("\n");
  const text = `${body}\n\nReconnect: ${url}\n${list ? `\nAffected listings:\n${list}\n` : ""}`;
  const html =
    `<p>${escapeHtml(body)}</p>` +
    `<p><a href="${escapeHtml(url)}">Reconnect CoinPay</a></p>` +
    (listings.length
      ? `<p>Affected listings:</p><ul>${listings
          .map((l) => `<li><a href="${escapeHtml(`${base}/gigs/${l.id}`)}">${escapeHtml(l.title)}</a></li>`)
          .join("")}</ul>`
      : "");
  return { title, body, subject: title, text, html };
}

/**
 * Record that a link is dead and tell its owner, once.
 *
 * Only sellers (an active for-hire listing) are told: a link used only to sign
 * in costs its owner nothing when it lapses, and mailing them would be noise.
 * Never throws; a notice is best effort and must not break the page that
 * discovered the fault.
 */
export async function markCoinpayLinkBroken(
  svc: Client,
  identity: { id: string; user_id: string; metadata: unknown },
  fault: CoinpayLinkFault,
  now: Date = new Date()
): Promise<{ notified: boolean }> {
  try {
    const meta = metadataObject(identity.metadata);
    const alreadyNotified = typeof meta.reconnect_notified_at === "string";
    const next: Record<string, unknown> = {
      ...meta,
      link_error: coinpayLinkFault(meta) ? meta.link_error : { code: fault, at: now.toISOString() },
    };

    let notified = false;
    if (!alreadyNotified) {
      const listings = await activeForHireListings(svc, identity.user_id);
      if (listings.length > 0) {
        const notice = reconnectNotice(listings, appUrl());
        await svc.from("notifications").insert({
          user_id: identity.user_id,
          type: "gig_update",
          title: notice.title,
          body: notice.body,
          data: { link: COINPAY_CONNECT_PATH, reason: "coinpay_reconnect_required", fault },
        });
        const { data } = await svc.auth.admin.getUserById(identity.user_id);
        const to = data?.user?.email;
        if (to) await sendEmail({ to, subject: notice.subject, html: notice.html, text: notice.text });
        next.reconnect_notified_at = now.toISOString();
        notified = true;
      }
    }

    await svc.from("oauth_identities").update({ metadata: next }).eq("id", identity.id);
    return { notified };
  } catch (error) {
    console.error("[coinpay-link] could not record a broken link:", error);
    return { notified: false };
  }
}
