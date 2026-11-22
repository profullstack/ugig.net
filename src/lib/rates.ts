// Server-side BTC→USD rate helper. Used to denominate sats-priced gigs in USD
// (the canonical `amount_usd` CoinPay charges). Mirrors the source the client
// /api/rates/btc route and SatsToUsd component use, with a short in-process cache.

import { withCoinpayUa } from "@/lib/coinpay-ua";

let cached: { rate: number; ts: number } | null = null;
const CACHE_MS = 5 * 60 * 1000; // 5 min

const SATS_PER_BTC = 100_000_000;

export const SATS_COINS = ["SATS", "LN", "BTC"];

export function isSatsCoin(coin?: string | null): boolean {
  return SATS_COINS.includes((coin || "").trim().toUpperCase());
}

/** Current BTC price in USD, or null if it can't be fetched and nothing is cached. */
export async function getBtcUsdRate(): Promise<number | null> {
  if (cached && Date.now() - cached.ts < CACHE_MS) {
    return cached.rate;
  }
  try {
    const res = await fetch("https://coinpayportal.com/api/rates?coin=BTC", withCoinpayUa({
      next: { revalidate: 300 },
    }));
    const data = await res.json();
    if (data.success && data.rate) {
      cached = { rate: data.rate, ts: Date.now() };
      return data.rate;
    }
  } catch {
    // fall through to any stale cached value
  }
  return cached?.rate ?? null;
}

/** Convert sats to USD at the given BTC price, rounded to cents. */
export function satsToUsd(sats: number, btcUsd: number): number {
  return Math.round((sats / SATS_PER_BTC) * btcUsd * 100) / 100;
}
