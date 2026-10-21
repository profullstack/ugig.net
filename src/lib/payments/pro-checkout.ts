/**
 * Pro / Lifetime checkout helpers: which coins the buyer may pick, whether the
 * PayPal (and card, via PayPal guest checkout) rail is on, and the metadata
 * every CoinPay payment carries so the webhook can map it back to the account.
 *
 * Server-only (reads CoinPay credentials).
 */
import { getSupportedCoins, SUPPORTED_CURRENCIES, type SupportedCoin } from "@/lib/coinpayportal";

/** Tag on every CoinPay payment ugig creates, so it is identifiable in CoinPay. */
export const PAYMENT_PROPERTY = "ugig.net";

export interface CheckoutCoin {
  /** CoinPay currency code sent to /payments/create, e.g. "usdc_pol", "doge". */
  value: string;
  label: string;
}

const COINS_TTL_MS = 10 * 60 * 1000;
let cachedCoins: { at: number; coins: CheckoutCoin[] } | null = null;

/**
 * Coins CoinPay lists but then refuses at payment creation (seen: USDC on
 * Base, "Unsupported blockchain for fee estimation: BASE"). Hidden from the
 * picker for an hour after a refusal, then offered again.
 */
const BROKEN_COIN_TTL_MS = 60 * 60 * 1000;
const brokenCoins = new Map<string, number>();

export function markCoinBroken(code: string) {
  brokenCoins.set(code, Date.now() + BROKEN_COIN_TTL_MS);
}

function isCoinBroken(code: string): boolean {
  const until = brokenCoins.get(code);
  if (!until) return false;
  if (Date.now() > until) {
    brokenCoins.delete(code);
    return false;
  }
  return true;
}

/** True for a CoinPay create error that means "this coin cannot be paid right now". */
export function isCoinRefusal(message: string): boolean {
  return /unsupported blockchain|not enabled|chain_not_enabled|no wallet|unsupported currency|invalid or missing cryptocurrency/i.test(
    message
  );
}

/** Test hook. */
export function resetCheckoutCoinsCache() {
  cachedCoins = null;
  brokenCoins.clear();
}

/** "USDC_POL" / "usdc-pol" -> "usdc_pol". */
export function coinCode(coin: SupportedCoin): string | null {
  const raw = coin.symbol || coin.code || coin.currency || coin.id;
  if (typeof raw !== "string" || !raw.trim()) return null;
  return raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** Stablecoins first (the price is in USD), then the rest alphabetically. */
function rank(code: string): number {
  if (code.startsWith("usdc")) return 0;
  if (code.startsWith("usdt")) return 1;
  return 2;
}

export function toCheckoutCoins(coins: SupportedCoin[]): CheckoutCoin[] {
  const seen = new Set<string>();
  const out: CheckoutCoin[] = [];
  for (const coin of coins) {
    if (coin.is_active === false || coin.has_wallet === false) continue;
    const value = coinCode(coin);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    const known = SUPPORTED_CURRENCIES[value as keyof typeof SUPPORTED_CURRENCIES]?.name;
    const label = (typeof coin.name === "string" && coin.name) || known || value.toUpperCase();
    out.push({ value, label });
  }
  return out.sort((a, b) => rank(a.value) - rank(b.value) || a.label.localeCompare(b.label));
}

/** Used only when CoinPay cannot be reached: the coins ugig has always taken. */
const FALLBACK_COINS: CheckoutCoin[] = toCheckoutCoins(
  Object.entries(SUPPORTED_CURRENCIES).map(([symbol, info]) => ({ symbol, name: info.name }))
);

/**
 * Every coin ugig's CoinPay business can receive right now (live from CoinPay's
 * /supported-coins, cached for ten minutes). Never a hardcoded single chain.
 */
export async function listCheckoutCoins(): Promise<CheckoutCoin[]> {
  const usable = (coins: CheckoutCoin[]) => coins.filter((c) => !isCoinBroken(c.value));
  if (cachedCoins && Date.now() - cachedCoins.at < COINS_TTL_MS) return usable(cachedCoins.coins);
  try {
    const res = await getSupportedCoins({ active_only: true });
    const coins = toCheckoutCoins(res.coins ?? []);
    if (coins.length > 0) {
      cachedCoins = { at: Date.now(), coins };
      return usable(coins);
    }
  } catch (err) {
    console.error("[pro-checkout] supported coins fetch failed:", err);
  }
  return usable(FALLBACK_COINS);
}

/**
 * PayPal (and debit/credit card through PayPal guest checkout, never Stripe)
 * is live on ugig's CoinPay business when UGIG_PAYPAL_BUY_NOW=true; the same
 * connected PayPal account takes Pro payments. UGIG_PAYPAL_CHECKOUT=false turns
 * it off for Pro alone.
 */
export function paypalCheckoutEnabled(): boolean {
  if (process.env.UGIG_PAYPAL_CHECKOUT === "false") return false;
  return process.env.UGIG_PAYPAL_CHECKOUT === "true" || process.env.UGIG_PAYPAL_BUY_NOW === "true";
}

export interface PaymentIdentity {
  userId: string;
  email?: string | null;
  username?: string | null;
}

/**
 * Metadata on every CoinPay payment: the property, the account (id, username,
 * email) and the local payments row id. The webhook maps a paid payment back
 * to the user from the local row, or from this when the row cannot be found.
 */
export function paymentMetadata(
  who: PaymentIdentity,
  extra: { ugig_payment_id: string; type: string; plan?: string; rail: string }
): Record<string, unknown> {
  return {
    property: PAYMENT_PROPERTY,
    user_id: who.userId,
    ...(who.username ? { username: who.username } : {}),
    ...(who.email ? { email: who.email } : {}),
    ugig_payment_id: extra.ugig_payment_id,
    type: extra.type,
    ...(extra.plan ? { plan: extra.plan } : {}),
    rail: extra.rail,
  };
}
