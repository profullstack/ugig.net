import { createHmac, timingSafeEqual } from "crypto";
import type { NotificationSettingKey } from "@/lib/notification-settings";

/**
 * Signed one-click unsubscribe links for notification emails.
 *
 * A token names one user and one notification setting, signed with
 * UNSUBSCRIBE_SECRET (falling back to CRON_SECRET, so a deploy without the new
 * variable still produces working links). Tokens do not expire: an unsubscribe
 * link in a months-old email must still work.
 *
 * Token format: base64url("<userId>:<setting>") + "." + base64url(hmac-sha256)
 */

export const UNSUBSCRIBABLE_SETTINGS: Record<NotificationSettingKey, string> = {
  email_new_message: "new message emails",
  email_new_comment: "comment emails",
  email_new_follower: "new follower emails",
  email_new_application: "new application emails",
  email_application_status: "application status emails",
  email_review_received: "review emails",
  email_endorsement_received: "endorsement emails",
  email_gig_updates: "gig update emails",
  email_mention: "mention emails",
  email_upvote_milestone: "upvote milestone emails",
};

export function isUnsubscribableSetting(value: string): value is NotificationSettingKey {
  return Object.prototype.hasOwnProperty.call(UNSUBSCRIBABLE_SETTINGS, value);
}

function getSecret(): string | null {
  return process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || null;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createUnsubscribeToken(
  userId: string,
  setting: NotificationSettingKey
): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const payload = Buffer.from(`${userId}:${setting}`).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyUnsubscribeToken(
  token: string | null | undefined
): { userId: string; setting: NotificationSettingKey } | null {
  const secret = getSecret();
  if (!secret || !token) return null;

  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length > 0) return null;

  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  const decoded = Buffer.from(payload, "base64url").toString("utf8");
  const sep = decoded.lastIndexOf(":");
  if (sep <= 0) return null;
  const userId = decoded.slice(0, sep);
  const setting = decoded.slice(sep + 1);
  if (!isUnsubscribableSetting(setting)) return null;

  return { userId, setting };
}

/** Absolute unsubscribe URL, or null when no signing secret is configured. */
export function unsubscribeUrl(
  baseUrl: string,
  userId: string,
  setting: NotificationSettingKey
): string | null {
  const token = createUnsubscribeToken(userId, setting);
  if (!token) return null;
  return `${baseUrl}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}
