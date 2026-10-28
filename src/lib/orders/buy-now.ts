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
import { loadProfilePayoutWallets, payoutWalletApiFix } from "@/lib/profile-payout-wallets";
import {
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

/**
 * "unavailable" is CoinPay not answering just now: the seller's link is fine
 * and nobody should be told to reconnect it.
 */
export type SellerNotReadyReason = "not_connected" | "needs_reconnect" | "no_wallets" | "unavailable";

export type SellerWalletsResult =
  | { ok: true; wallets: CoinPayGlobalWallet[]; source: "coinpay" | "profile" }
  | { ok: false; reason: SellerNotReadyReason };

/**
 * The seller's receiving wallets that escrow can pay out to.
 *
 * A live CoinPay link (Settings > Connections) wins: it is the same link gig
 * invoices pay into. Without one, the seller's own validated profile payout
 * wallets are used, which is how an agent with only an API key becomes
 * buyable (see profile-payout-wallets.ts). Either way the address comes from
 * the seller's account, never from the buyer's request.
 */
export async function sellerEscrowWallets(sellerId: string): Promise<SellerWalletsResult> {
  let reason: SellerNotReadyReason;
  // The link's wallets are the addresses saved when the seller connected (no
  // CoinPay token is stored, so nothing here can act as the seller).
  const link = await getCoinpayLink(sellerId);
  if (!link.wallets) {
    reason = link.state === "none" ? "not_connected" : link.temporary ? "unavailable" : "needs_reconnect";
  } else {
    const wallets = link.wallets.filter((w) => BUY_NOW_CURRENCIES.includes(w.currency));
    if (wallets.length > 0) return { ok: true, wallets, source: "coinpay" };
    reason = "no_wallets";
  }

  const profileWallets = await loadProfilePayoutWallets(sellerId, BUY_NOW_CURRENCIES);
  if (profileWallets.length > 0) return { ok: true, wallets: profileWallets, source: "profile" };
  return { ok: false, reason };
}

const BUY_NOW_COIN_KEYS = BUY_NOW_CURRENCIES.join(", ");

export function sellerNotReadyMessage(reason: SellerNotReadyReason): string {
  switch (reason) {
    case "not_connected":
      return "This seller hasn't added a payout wallet yet, so they can't be paid. Message them instead.";
    case "needs_reconnect":
      return "Payments are unavailable: this seller's CoinPay connection expired and the seller must reconnect it. Message them instead.";
    case "unavailable":
      return "Payments to this seller are briefly unavailable (CoinPay did not answer). Try again in a few minutes.";
    case "no_wallets":
      return "This seller has no payout wallet for a coin escrow supports. Message them instead.";
  }
}

/** Step-by-step: get a wallet address without a browser, then set it. */
export const PAYOUT_WALLET_HELP_URL = "https://ugig.net/skill.md#payments";

/** The no-browser fix, spelled out for an agent reading the JSON. */
const API_FIX_SENTENCE =
  "From the API (no browser needed): PUT /api/profile/wallet-addresses with " +
  `{"wallet_addresses":[{"currency":"usdc_sol","address":"<your address>","is_preferred":true}]}. ` +
  `Currency must be one of: ${BUY_NOW_COIN_KEYS}. That call replaces your list, so GET it first to keep existing entries. ` +
  `No CoinPay account is needed: any wallet you control works. No wallet yet? See ${PAYOUT_WALLET_HELP_URL} to make one from the command line.`;

/** Added to the owner's message when PayPal Buy now is on: the no-crypto route. */
export const PAYPAL_PAYOUT_SENTENCE =
  "No crypto? Save a PayPal payout email instead: PUT /api/profile/payout-paypal with " +
  '{"paypal_email":"you@example.com"}. Buyers can then pay by card or PayPal, and you are paid to that PayPal account.';

export function ownerNotReadyMessage(reason: SellerNotReadyReason): string {
  const base = ownerNotReadyBase(reason);
  return paypalBuyNowEnabled() ? `${base} ${PAYPAL_PAYOUT_SENTENCE}` : base;
}

function ownerNotReadyBase(reason: SellerNotReadyReason): string {
  switch (reason) {
    case "not_connected":
      return `Add a payout wallet to let buyers pay for this listing with Buy now. ${API_FIX_SENTENCE} Or connect CoinPay in Settings > Connections.`;
    case "needs_reconnect":
      return `Buy now is off: your CoinPay connection expired or can't read your wallet addresses. Reconnect CoinPay in Settings > Connections (once; ugig keeps it refreshed after that). ${API_FIX_SENTENCE}`;
    case "unavailable":
      return "Buy now is paused for a moment: CoinPay did not answer when ugig refreshed your connection. Nothing to do; it retries on the next view.";
    case "no_wallets":
      return `Add a payout wallet in a coin escrow supports (USDT on Polygon or Solana is not one). ${API_FIX_SENTENCE}`;
  }
}

/** Structured form of the same fix, for clients that act on JSON. */
export function ownerApiFix() {
  return payoutWalletApiFix(BUY_NOW_CURRENCIES);
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
  "seller_payout_address, expires_at, funded_at, delivered_at, released_at, metadata, created_at, updated_at, " +
  "payment_rail, payout_currency, payout_status, payout_tx_hash, payout_paid_at";

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
  payment_rail?: "crypto" | "paypal";
  /** PayPal orders: "paypal" when the seller is paid to a PayPal email, else the coin. */
  payout_currency?: string | null;
}

/** Load an order with its token, for a server-side action by one of its parties. */
export async function loadOrderForAction(
  supabase: SupabaseClient,
  orderId: string,
): Promise<OrderRow | null> {
  const { data } = await supabase
    .from("gig_orders")
    .select("id, gig_id, buyer_id, seller_id, status, amount_usd, platform_fee_usd, coinpay_escrow_id, coinpay_release_token, payment_rail, payout_currency")
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

// ─── PayPal ────────────────────────────────────────────────────────────────

/**
 * PayPal Buy now is off until ugig's CoinPay business has PayPal connected and
 * UGIG_PAYPAL_BUY_NOW=true is set. A PayPal order is held by ugig, not escrow.
 */
export function paypalBuyNowEnabled(): boolean {
  return process.env.UGIG_PAYPAL_BUY_NOW === "true";
}

/** Where ugig pays a PayPal order's seller: a stablecoin wallet when they have one. */
export function pickPayoutWallet(wallets: CoinPayGlobalWallet[]): CoinPayGlobalWallet {
  const preference: SupportedCurrency[] = ["usdc_sol", "usdc_pol", "usdc_eth"];
  for (const currency of preference) {
    const w = wallets.find((x) => x.currency === currency);
    if (w) return w;
  }
  return wallets[0];
}

/**
 * Release a PayPal order: the buyer's money is already in ugig's PayPal, so the
 * seller's share becomes a payout an admin owes. Guarded on status so a release
 * and the 14-day auto-release cannot both record it.
 */
export async function releasePaypalOrder(
  supabase: SupabaseClient,
  order: Pick<OrderRow, "id" | "gig_id" | "seller_id" | "amount_usd" | "platform_fee_usd" | "payout_currency">,
  reason: "buyer" | "auto",
): Promise<boolean> {
  const moved = await transitionOrder(supabase, order.id, ["funded", "delivered"], {
    status: "released",
    released_at: new Date().toISOString(),
    payout_status: "owed",
  });
  if (!moved) return false;

  const net = Math.round((order.amount_usd - order.platform_fee_usd) * 100) / 100;
  const toPaypal = order.payout_currency === "paypal";
  await notifyOrderParty(
    supabase,
    order.seller_id,
    "payment_received",
    "Payment released",
    `${reason === "auto" ? "Your order auto-released" : "The buyer released payment"}: $${net} will be sent to your ${toPaypal ? "PayPal account" : "payout wallet"}.`,
    { gig_id: order.gig_id, order_id: order.id }
  );
  await alertOrderAdmin(
    `PayPal payout owed: $${net}`,
    `Order ${order.id} was ${reason === "auto" ? "auto-released after 14 days" : "released by the buyer"}. ` +
      `Pay the seller $${net} ${toPaypal ? "by PayPal (to their payout email)" : "in crypto (to their payout wallet)"} ` +
      `and mark it paid at https://ugig.net/admin/payouts`
  );
  return true;
}

/** Email the ops address about an order that needs a human. Best effort. */
export async function alertOrderAdmin(subject: string, text: string): Promise<void> {
  const to = process.env.ORDER_ALERT_EMAIL;
  if (!to) {
    console.warn(`[orders] ORDER_ALERT_EMAIL unset; not emailing: ${subject}`);
    return;
  }
  try {
    const { sendEmail } = await import("@/lib/email");
    await sendEmail({ to, subject: `[ugig orders] ${subject}`, text, html: `<p>${text.replace(/</g, "&lt;")}</p>` });
  } catch (error) {
    console.error("[orders] admin alert failed:", error);
  }
}
