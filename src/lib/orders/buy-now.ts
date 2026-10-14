/**
 * "Buy now" on fixed-price for-hire listings.
 *
 * The buyer pays the listing's price into a CoinPay escrow whose beneficiary is
 * the seller's own CoinPay wallet. ugig's fee is a CoinPay marketplace fee, paid
 * by CoinPay to ugig's business wallet when the escrow settles, so ugig never
 * holds the money. The buyer releases after delivery; an escrow nobody touches
 * auto-releases to the seller at expiry, and a dispute stops that.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ESCROW_FEE_RATE } from "@/lib/constants";
import { getBtcUsdRate, isSatsCoin, satsToUsd } from "@/lib/rates";
import { getCoinpayLink } from "@/lib/coinpay-oauth";
import {
  readCoinpayUserinfoWallets,
  SUPPORTED_CURRENCIES,
  type CoinPayGlobalWallet,
  type SupportedCurrency,
} from "@/lib/coinpayportal";

/** ugig's cut, in percent, as CoinPay's `marketplace_fee_percent` takes it. */
export const BUY_NOW_FEE_PERCENT = ESCROW_FEE_RATE * 100;

/** How long the buyer has to release or dispute before it auto-releases. */
export const ORDER_ESCROW_HOURS = 14 * 24;

/** Coins CoinPay escrow can hold. USDT on Polygon/Solana is not one of them. */
export const BUY_NOW_CURRENCIES: SupportedCurrency[] = [
  "usdc_sol",
  "usdc_pol",
  "usdc_eth",
  "sol",
  "pol",
  "eth",
  "btc",
  "bch",
];

export type OrderStatus =
  | "pending_payment"
  | "funded"
  | "delivered"
  | "released"
  | "refunded"
  | "disputed"
  | "expired";

export interface BuyableGig {
  id: string;
  title: string;
  poster_id: string;
  listing_type?: string | null;
  status?: string | null;
  budget_type?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  payment_coin?: string | null;
}

export const BUYABLE_GIG_COLUMNS =
  "id, title, poster_id, listing_type, status, budget_type, budget_min, budget_max, payment_coin";

/** The listing's fixed price in its own unit (USD, or sats for sats coins). */
export function listingPrice(gig: BuyableGig): number | null {
  const price = Number(gig.budget_min ?? gig.budget_max ?? 0);
  return Number.isFinite(price) && price > 0 ? price : null;
}

/** Why this viewer cannot buy this listing, or null when they can. */
export function buyNowBlocker(gig: BuyableGig, viewerId: string | null): string | null {
  if (gig.listing_type !== "for_hire") return "Only for-hire listings can be bought directly";
  if (gig.status !== "active") return "This listing is not active";
  if (gig.budget_type !== "fixed") return "Only fixed-price listings can be bought directly";
  if (listingPrice(gig) === null) return "This listing has no price";
  if (viewerId && viewerId === gig.poster_id) return "You cannot buy your own listing";
  return null;
}

export type PriceResult =
  | { ok: true; usd: number; nativeAmount: number; nativeUnit: "USD" | "sats"; btcUsd: number | null }
  | { ok: false; error: string; status: number };

/** Price in USD, the unit CoinPay escrows in. */
export async function listingPriceUsd(gig: BuyableGig): Promise<PriceResult> {
  const nativeAmount = listingPrice(gig);
  if (nativeAmount === null) return { ok: false, error: "This listing has no price", status: 400 };

  if (!isSatsCoin(gig.payment_coin)) {
    return { ok: true, usd: round2(nativeAmount), nativeAmount, nativeUnit: "USD", btcUsd: null };
  }

  const btcUsd = await getBtcUsdRate();
  if (!btcUsd) {
    return { ok: false, error: "Couldn't fetch the current BTC price. Try again shortly.", status: 503 };
  }
  const usd = round2(satsToUsd(nativeAmount, btcUsd));
  if (usd <= 0) return { ok: false, error: "This listing's price rounds to $0.00", status: 400 };
  return { ok: true, usd, nativeAmount, nativeUnit: "sats", btcUsd };
}

export function orderFeeUsd(amountUsd: number): number {
  return round2(amountUsd * ESCROW_FEE_RATE);
}

export type SellerWalletsResult =
  | { ok: true; wallets: CoinPayGlobalWallet[] }
  | { ok: false; reason: "not_connected" | "needs_reconnect" | "no_wallets" };

/**
 * The seller's CoinPay receiving wallets that escrow can pay out to. The seller
 * links CoinPay once (Settings > Connections) and keeps global wallets there;
 * the same link is what gig invoices pay into.
 */
export async function sellerEscrowWallets(sellerId: string): Promise<SellerWalletsResult> {
  const link = await getCoinpayLink(sellerId);
  if (link.accessToken === null) {
    return { ok: false, reason: link.state === "none" ? "not_connected" : "needs_reconnect" };
  }
  const userinfo = await readCoinpayUserinfoWallets(link.accessToken);
  if (userinfo.status !== "ok") return { ok: false, reason: "needs_reconnect" };

  const wallets = userinfo.wallets.filter((w) => BUY_NOW_CURRENCIES.includes(w.currency));
  if (wallets.length === 0) return { ok: false, reason: "no_wallets" };
  return { ok: true, wallets };
}

export function sellerNotReadyMessage(reason: "not_connected" | "needs_reconnect" | "no_wallets"): string {
  switch (reason) {
    case "not_connected":
      return "This seller hasn't connected a CoinPay wallet yet, so they can't be paid. Message them instead.";
    case "needs_reconnect":
      return "This seller's CoinPay connection needs to be renewed before they can be paid. Message them instead.";
    case "no_wallets":
      return "This seller has no CoinPay wallet for a coin escrow supports. Message them instead.";
  }
}

export function ownerNotReadyMessage(reason: "not_connected" | "needs_reconnect" | "no_wallets"): string {
  switch (reason) {
    case "not_connected":
      return "Connect your CoinPay wallet to let buyers pay for this listing directly with Buy now.";
    case "needs_reconnect":
      return "Reconnect CoinPay to turn on Buy now: your link was made before ugig could read your wallet addresses.";
    case "no_wallets":
      return "Add a USDC, SOL, POL, ETH, BTC or BCH wallet in CoinPay to turn on Buy now (escrow can't hold USDT on Polygon or Solana).";
  }
}

export function currencyLabel(currency: string): string {
  return SUPPORTED_CURRENCIES[currency as SupportedCurrency]?.name ?? currency.toUpperCase();
}

/** Best-effort in-app notification; an order never fails because one didn't send. */
export async function notifyOrderParty(
  supabase: SupabaseClient,
  userId: string,
  type: "payment_received" | "gig_update",
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from("notifications").insert({ user_id: userId, type, title, body, data });
  } catch (error) {
    console.error("[orders] notification failed:", error);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Everything a buyer or seller may see. Never includes the release token. */
export const ORDER_PUBLIC_COLUMNS =
  "id, gig_id, buyer_id, seller_id, status, amount_usd, currency, platform_fee_rate, platform_fee_usd, " +
  "requirements, delivery_note, coinpay_escrow_id, escrow_address, amount_crypto, buyer_refund_address, " +
  "seller_payout_address, expires_at, funded_at, delivered_at, released_at, metadata, created_at, updated_at";

export interface OrderRow {
  id: string;
  gig_id: string;
  buyer_id: string;
  seller_id: string;
  status: OrderStatus;
  amount_usd: number;
  platform_fee_usd: number;
  coinpay_escrow_id: string | null;
  coinpay_release_token?: string | null;
}

/** Load an order with its token, for a server-side action by one of its parties. */
export async function loadOrderForAction(
  supabase: SupabaseClient,
  orderId: string,
): Promise<OrderRow | null> {
  const { data } = await supabase
    .from("gig_orders")
    .select("id, gig_id, buyer_id, seller_id, status, amount_usd, platform_fee_usd, coinpay_escrow_id, coinpay_release_token")
    .eq("id", orderId)
    .single();
  return (data as OrderRow | null) ?? null;
}

/** Guarded status move: only applies when the row is still in one of `from`. */
export async function transitionOrder(
  supabase: SupabaseClient,
  orderId: string,
  from: OrderStatus[],
  patch: Record<string, unknown>,
): Promise<boolean> {
  const { data } = await supabase
    .from("gig_orders")
    .update(patch)
    .eq("id", orderId)
    .in("status", from)
    .select("id");
  return Array.isArray(data) && data.length > 0;
}
