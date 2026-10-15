/**
 * Payout wallets a user keeps on their own ugig profile.
 *
 * Gig invoices and Buy now used to pay only wallets read through a CoinPay
 * OAuth link. Linking needs a browser, so an agent working from an API key
 * could post a for-hire listing but never be paid for it, while bounties
 * already paid the address on the winner's profile. These are the same
 * coordinates, held to a stricter standard because escrow pays to them:
 *
 * - set only by the account itself (PUT /api/profile/wallet-addresses with its
 *   own session or API key), never taken from a buyer's or payer's request;
 * - the currency must be one of CoinPay's exact keys (`usdc_sol`, `eth`, ...).
 *   Free text like "usdc" names no chain and is skipped, not guessed;
 * - the address must be valid for that chain.
 *
 * An order or invoice copies the address it pays when it is created, so a
 * later edit never moves money already in flight.
 */
import { createServiceClient } from "@/lib/supabase/service";
import {
  SUPPORTED_CURRENCIES,
  validateCoinpayReceivingAddress,
  type CoinPayGlobalWallet,
  type SupportedCurrency,
} from "@/lib/coinpayportal";

/** The CoinPay currency key a stored entry names, or null if it names none exactly. */
export function payoutCurrencyKey(value: unknown): SupportedCurrency | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return Object.prototype.hasOwnProperty.call(SUPPORTED_CURRENCIES, key)
    ? (key as SupportedCurrency)
    : null;
}

export type PayoutWalletCheck =
  | { ok: true; currency: SupportedCurrency; address: string }
  | { ok: false; reason: "unknown_currency" | "invalid_address" };

/** Can this stored entry be paid out to? */
export function checkPayoutWallet(entry: unknown): PayoutWalletCheck {
  const w = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
  const currency = payoutCurrencyKey(w.currency);
  // Plain "usdt" names no chain (profiles hold Tron and BSC addresses under it).
  if (!currency || currency === "usdt") return { ok: false, reason: "unknown_currency" };
  const address = typeof w.address === "string" ? w.address.trim() : "";
  if (!validateCoinpayReceivingAddress(currency, address)) return { ok: false, reason: "invalid_address" };
  return { ok: true, currency, address };
}

/**
 * The payable wallets in a profile's `wallet_addresses`, one per currency
 * (the preferred entry wins), limited to `allowed` when given.
 */
export function profilePayoutWallets(
  stored: unknown,
  allowed?: readonly SupportedCurrency[],
): CoinPayGlobalWallet[] {
  if (!Array.isArray(stored)) return [];
  const entries = [...stored].sort(
    (a, b) => Number(Boolean((b as { is_preferred?: unknown })?.is_preferred)) -
      Number(Boolean((a as { is_preferred?: unknown })?.is_preferred)),
  );
  const out: CoinPayGlobalWallet[] = [];
  for (const entry of entries) {
    const check = checkPayoutWallet(entry);
    if (!check.ok) continue;
    if (allowed && !allowed.includes(check.currency)) continue;
    if (out.some((w) => w.currency === check.currency)) continue;
    out.push({
      currency: check.currency,
      cryptocurrency: check.currency.toUpperCase(),
      label: "ugig profile wallet",
      address: check.address,
      network: null,
    });
  }
  return out;
}

/** Load a user's payable profile wallets. Empty on any failure. */
export async function loadProfilePayoutWallets(
  userId: string,
  allowed?: readonly SupportedCurrency[],
): Promise<CoinPayGlobalWallet[]> {
  try {
    const { data } = await createServiceClient()
      .from("profiles")
      .select("wallet_addresses")
      .eq("id", userId)
      .single();
    return profilePayoutWallets((data as { wallet_addresses?: unknown } | null)?.wallet_addresses, allowed);
  } catch (error) {
    console.error("[payout-wallets] profile lookup failed:", error);
    return [];
  }
}

/** The one-call fix an agent can make with its API key, for error bodies. */
export function payoutWalletApiFix(currencies: readonly SupportedCurrency[]) {
  return {
    method: "PUT",
    path: "/api/profile/wallet-addresses",
    body: { wallet_addresses: [{ currency: currencies[0], address: "<your receiving address>", is_preferred: true }] },
    currencies: [...currencies],
    note: "Replaces your whole list: GET /api/profile/wallet-addresses first and resend the entries you want to keep.",
  };
}
