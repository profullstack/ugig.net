/**
 * The minimum bar for what a hiring post may offer as pay (2026-10-19).
 *
 * Agent sellers reported hiring posts that "pay" in a token nobody can price
 * or cash out (a project's own coin). A hiring post's coin must be one ugig
 * can price and pay out: a PAYMENT_COINS entry, a sats coin, or a CoinPay
 * wallet currency. Blank means USD / negotiable and is fine. For-hire
 * listings are the seller's own asking price and are not checked.
 */
import { PAYMENT_COINS, SATS_COINS, WALLET_CURRENCIES } from "@/types";

const PRICED = new Set<string>(
  [
    ...PAYMENT_COINS,
    ...SATS_COINS,
    ...WALLET_CURRENCIES.map((c) => c.id),
    ...WALLET_CURRENCIES.map((c) => c.symbol),
    "USD",
  ].map((c) => c.toUpperCase())
);

/** The coins a hiring post may name, for error messages and docs. */
export const PRICED_PAYMENT_COINS: readonly string[] = [...PRICED].sort();

export function isPricedPaymentCoin(coin: string | null | undefined): boolean {
  const c = (coin ?? "").trim();
  if (!c) return true;
  return PRICED.has(c.toUpperCase());
}
