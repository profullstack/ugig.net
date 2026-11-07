/**
 * Profullstack Pass on ugig.net: a CoinPay user who deposited $99 into their
 * own CoinPay wallet gets a free month of ugig Pro (https://coinpayportal.com/pass).
 *
 * CoinPay reports it only in the userinfo `pass` claim at sign-in:
 *   "pass": { "active": true, "expires_at": "2026-12-07T18:00:00.000Z" }
 * The OAuth callback applies it to the account bound to the CoinPay `sub`
 * (lib/coinpay-login.ts), never one found by email. Pro runs on the same
 * subscriptions row CoinPay payments and credit codes extend, to the later of
 * its current end and the pass end (extendProUntil), so a repeat sign-in
 * changes nothing and a longer paid term is kept. The pass only unlocks the
 * Pro plan: it never funds gig payments or any balance paid to someone else.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { extendProUntil } from "@/lib/payments/checkout-settlement";

export const PASS_URL = "https://coinpayportal.com/pass";

export type CoinpayPass = { active: boolean; expiresAt: Date | null };

/** Reads the userinfo `pass` claim; active only with a future, parseable expires_at. */
export function passFromUserinfo(claims: unknown, now: Date = new Date()): CoinpayPass {
  const pass = claims && typeof claims === "object" ? (claims as { pass?: unknown }).pass : null;
  if (!pass || typeof pass !== "object") return { active: false, expiresAt: null };
  const { active, expires_at } = pass as { active?: unknown; expires_at?: unknown };
  const parsed = typeof expires_at === "string" && expires_at.trim() ? new Date(expires_at) : null;
  const expiresAt = parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
  return { active: active === true && expiresAt !== null && expiresAt.getTime() > now.getTime(), expiresAt };
}

/** Pro until the pass ends, for a user whose userinfo carries an active pass. */
export async function applyCoinpayPass(
  supabase: SupabaseClient<any>,
  userId: string,
  userinfo: unknown,
  now: Date = new Date()
): Promise<{ periodEnd: Date } | null> {
  const pass = passFromUserinfo(userinfo, now);
  if (!userId || !pass.active || !pass.expiresAt) return null;
  const sub = (userinfo as { sub?: unknown }).sub;
  return extendProUntil(supabase, {
    userId,
    until: pass.expiresAt,
    source: `coinpay-pass:${typeof sub === "string" ? sub : ""}:${pass.expiresAt.toISOString()}`,
  });
}
