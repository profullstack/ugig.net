/**
 * Settlement of CoinPay checkout payments (the `payments` and
 * `funding_payments` tables): Pro monthly/annual, Lifetime, tips, and
 * crowdfunding. Shared by the CoinPay webhook and the status poll so that
 * whichever sees a payment settle first activates the purchase, exactly once.
 *
 * Gig invoices, bounties and escrow are settled in the webhook route itself.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COINPAY_PLAN_PERIOD_MONTHS,
  FUNDING_LIFETIME_THRESHOLD_USD,
  type CoinPayPlan,
} from "@/lib/plans";

type Db = SupabaseClient<any>;

export type PaymentStatus = "pending" | "confirmed" | "forwarded" | "expired" | "failed";

/** Statuses from which a confirmed/forwarded event activates the purchase. */
export const UNSETTLED_PAYMENT_STATUSES: PaymentStatus[] = ["pending", "expired", "failed"];
const SETTLED_PAYMENT_STATUSES: PaymentStatus[] = ["confirmed", "forwarded"];

/**
 * Map a CoinPay payment status (webhook `data.status`, event suffix, or the
 * status API) onto the local payment_status enum.
 */
export function mapCoinPayStatus(status: string | null | undefined): PaymentStatus {
  switch ((status || "").toLowerCase()) {
    case "confirmed":
    case "completed":
    case "paid":
    case "forwarding":
    case "forwarding_failed":
      // Funds arrived; only the merchant forward is outstanding or retrying.
      return "confirmed";
    case "forwarded":
      return "forwarded";
    case "expired":
      return "expired";
    case "failed":
    case "cancelled":
    case "canceled":
      return "failed";
    default:
      // pending, detected, confirming, processing, unknown
      return "pending";
  }
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizePlan(value: unknown): CoinPayPlan | null {
  return value === "monthly" || value === "annual" || value === "lifetime" ? value : null;
}

export interface SettlementEvent {
  coinpayPaymentId: string;
  /** confirmed or forwarded: both mean the buyer paid. */
  status: "confirmed" | "forwarded";
  amountUsd?: unknown;
  amountCrypto?: unknown;
  txHash?: string | null;
  merchantTxHash?: string | null;
  /** The metadata CoinPay echoes back (what the create route sent). */
  providerMetadata?: Record<string, unknown> | null;
}

export interface SettlementResult {
  /** A local payments row matched. */
  found: boolean;
  /** This call moved the row from unsettled to settled and ran activation. */
  activated: boolean;
}

/**
 * Record a confirmed/forwarded checkout payment and activate what it bought.
 *
 * - `forwarded` is treated as confirmed-or-better: if no `confirmed` event
 *   arrived first, it still activates.
 * - Activation runs once: only the update that moves the row out of an
 *   unsettled status (guarded in the WHERE clause) activates.
 * - Metadata is merged, never replaced (it holds the plan and checkout URL).
 * - A `confirmed` arriving after `forwarded` does not move the status back.
 */
export async function settleCheckoutPayment(
  supabase: Db,
  event: SettlementEvent
): Promise<SettlementResult> {
  const { data: payment } = await supabase
    .from("payments")
    .select("*")
    .eq("coinpay_payment_id", event.coinpayPaymentId)
    .maybeSingle();

  if (!payment) return { found: false, activated: false };

  const now = new Date().toISOString();
  const existingMetadata = asRecord(payment.metadata);
  const providerMetadata = asRecord(event.providerMetadata);
  const plan = normalizePlan(existingMetadata.plan) ?? normalizePlan(providerMetadata.plan);

  const metadata: Record<string, unknown> = { ...existingMetadata };
  if (plan && !existingMetadata.plan) metadata.plan = plan;
  if (event.txHash) metadata.tx_hash = event.txHash;
  if (event.merchantTxHash) metadata.merchant_tx_hash = event.merchantTxHash;
  if (event.status === "forwarded") metadata.forwarded_at = now;

  const amountCrypto = toNumber(event.amountCrypto);
  const baseUpdate: Record<string, unknown> = { metadata, updated_at: now };
  if (amountCrypto !== null) baseUpdate.amount_crypto = amountCrypto;

  // Claim the transition: only one caller moves the row out of unsettled.
  const { data: claimed } = await supabase
    .from("payments")
    .update({ ...baseUpdate, status: event.status })
    .eq("id", payment.id)
    .in("status", UNSETTLED_PAYMENT_STATUSES)
    .select("*")
    .maybeSingle();

  if (!claimed) {
    // Already settled: fold in forward proof, upgrade confirmed -> forwarded.
    const update: Record<string, unknown> = { ...baseUpdate };
    if (event.status === "forwarded") update.status = "forwarded";
    await supabase
      .from("payments")
      .update(update)
      .eq("id", payment.id)
      .in("status", SETTLED_PAYMENT_STATUSES);
    return { found: true, activated: false };
  }

  const amountUsd = toNumber(event.amountUsd) ?? toNumber(payment.amount_usd) ?? 0;
  await activatePurchase(supabase, {
    paymentId: payment.id,
    coinpayPaymentId: event.coinpayPaymentId,
    userId: payment.user_id,
    type: payment.type,
    plan,
    amountUsd,
  });

  return { found: true, activated: true };
}

async function activatePurchase(
  supabase: Db,
  p: {
    paymentId: string;
    coinpayPaymentId: string;
    userId: string;
    type: string;
    plan: CoinPayPlan | null;
    amountUsd: number;
  }
) {
  if (p.type === "subscription") {
    if (p.plan === "lifetime") {
      await grantLifetime(supabase, {
        userId: p.userId,
        paymentId: p.paymentId,
        amountUsd: p.amountUsd,
        reason: "purchase",
      });
    } else {
      await extendCoinPayPro(supabase, {
        userId: p.userId,
        coinpayPaymentId: p.coinpayPaymentId,
        paymentId: p.paymentId,
        plan: p.plan ?? "monthly",
        amountUsd: p.amountUsd,
      });
    }
    return;
  }

  // Funding through the checkout table: $50+ grants Lifetime.
  if (p.amountUsd >= FUNDING_LIFETIME_THRESHOLD_USD) {
    await grantLifetime(supabase, {
      userId: p.userId,
      paymentId: p.paymentId,
      amountUsd: p.amountUsd,
      reason: "funding",
    });
  }
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Grant months of CoinPay-billed Pro. Paying early extends from the current
 * end date instead of from today. Never touches a Lifetime plan.
 */
export async function extendCoinPayPro(
  supabase: Db,
  p: {
    userId: string;
    coinpayPaymentId: string;
    paymentId: string;
    plan: "monthly" | "annual";
    amountUsd: number;
  }
) {
  const now = new Date();
  const months = COINPAY_PLAN_PERIOD_MONTHS[p.plan];

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id, plan, status, current_period_start, current_period_end, stripe_subscription_id")
    .eq("user_id", p.userId)
    .maybeSingle();

  if (existing?.plan === "lifetime") {
    console.warn("[coinpay] Pro payment from a Lifetime member; plan left unchanged", {
      payment_id: p.paymentId,
    });
    return;
  }

  const currentEnd = existing?.current_period_end ? new Date(existing.current_period_end) : null;
  const stillRunning =
    existing?.plan === "pro" &&
    existing.status === "active" &&
    !existing.stripe_subscription_id &&
    currentEnd !== null &&
    currentEnd > now;

  const periodStart = stillRunning && existing?.current_period_start
    ? existing.current_period_start
    : now.toISOString();
  const periodEnd = addMonths(stillRunning && currentEnd ? currentEnd : now, months);

  await supabase.from("subscriptions").upsert(
    {
      user_id: p.userId,
      coinpay_payment_id: p.coinpayPaymentId,
      status: "active",
      plan: "pro",
      current_period_start: periodStart,
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
      updated_at: now.toISOString(),
    },
    { onConflict: "user_id" }
  );

  await supabase.from("notifications").insert({
    user_id: p.userId,
    type: "payment_received",
    title: "Pro subscription activated",
    body: `Your Pro plan is active until ${periodEnd.toISOString().slice(0, 10)}. Enjoy unlimited gig posts!`,
    data: {
      payment_id: p.paymentId,
      plan: p.plan,
      amount_usd: p.amountUsd,
      current_period_end: periodEnd.toISOString(),
    },
  });
}

/**
 * Set the user's plan to Lifetime (no end date). Idempotent: returns false and
 * sends nothing when the user already has Lifetime.
 */
export async function grantLifetime(
  supabase: Db,
  p: { userId: string; paymentId: string; amountUsd: number; reason: "purchase" | "funding" }
): Promise<boolean> {
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id, plan")
    .eq("user_id", p.userId)
    .maybeSingle();

  if (existing?.plan === "lifetime") return false;

  const fields = {
    status: "active",
    plan: "lifetime",
    current_period_start: now,
    current_period_end: null,
    cancel_at_period_end: false,
    updated_at: now,
  };

  if (!existing) {
    await supabase.from("subscriptions").insert({ user_id: p.userId, ...fields });
  } else {
    await supabase.from("subscriptions").update(fields).eq("id", existing.id);
  }

  await supabase.from("notifications").insert({
    user_id: p.userId,
    type: "payment_received",
    title: "Lifetime membership unlocked",
    body:
      p.reason === "funding"
        ? `Thank you! Your $${p.amountUsd.toFixed(2)} contribution includes a Lifetime membership.`
        : "Your Lifetime membership is active. Unlimited gig posts, forever.",
    data: {
      payment_id: p.paymentId,
      reward: "lifetime",
      reason: p.reason,
      ...(p.reason === "funding" ? { threshold_usd: FUNDING_LIFETIME_THRESHOLD_USD } : {}),
    },
  });

  return true;
}

export type FundingEventStatus = "confirmed" | "forwarded" | "expired" | "failed";

const FUNDING_SETTLED = new Set(["paid", "confirmed", "forwarded"]);

/**
 * Update a crowdfunding payment (funding_payments) from a CoinPay event and,
 * once it is paid, grant the $50+ Lifetime reward and log it in
 * funding_rewards_log. Safe to replay: a settled row is never moved back to
 * pending/expired/failed or from forwarded to confirmed, and the reward is
 * logged once per funding payment.
 *
 * Returns true when the event belongs to crowdfunding (handled here).
 */
export async function handleFundingPaymentEvent(
  supabase: Db,
  event: {
    coinpayPaymentId: string;
    status: FundingEventStatus;
    amountUsd?: unknown;
    amountCrypto?: unknown;
    txHash?: string | null;
    providerMetadata?: Record<string, unknown> | null;
  }
): Promise<boolean> {
  const providerMetadata = asRecord(event.providerMetadata);
  const { data: row, error: lookupError } = await supabase
    .from("funding_payments")
    .select("*")
    .eq("coinpay_payment_id", event.coinpayPaymentId)
    .maybeSingle();

  if (lookupError) {
    console.error("[coinpay webhook] funding lookup failed:", lookupError);
    throw new Error("Funding payment lookup failed");
  }

  const isFunding = Boolean(row) || providerMetadata.type === "funding";
  if (!isFunding) return false;

  const now = new Date().toISOString();
  const settled = event.status === "confirmed" || event.status === "forwarded";

  if (row) {
    const wasSettled = FUNDING_SETTLED.has(row.status);
    let nextStatus: string = event.status;
    if (wasSettled && !settled) nextStatus = row.status; // never un-pay
    if (row.status === "forwarded" && event.status === "confirmed") nextStatus = "forwarded";

    const update: Record<string, unknown> = { status: nextStatus, updated_at: now };
    if (event.txHash) update.tx_hash = event.txHash;
    const amountCrypto = toNumber(event.amountCrypto);
    if (amountCrypto !== null) update.amount_crypto = amountCrypto;
    if (settled && !row.paid_at) update.paid_at = now;

    const { error } = await supabase.from("funding_payments").update(update).eq("id", row.id);
    if (error) {
      console.error("[coinpay webhook] funding update failed:", error);
      throw new Error("Funding payment update failed");
    }
  }

  if (!settled) return true;

  const userId =
    (row?.user_id as string | null) ??
    (typeof providerMetadata.user_id === "string" ? providerMetadata.user_id : null);
  const amountUsd = toNumber(row?.amount_usd) ?? toNumber(event.amountUsd) ?? 0;

  if (!userId || amountUsd < FUNDING_LIFETIME_THRESHOLD_USD) return true;

  await grantLifetime(supabase, {
    userId,
    paymentId: row?.id ?? event.coinpayPaymentId,
    amountUsd,
    reason: "funding",
  });

  await logFundingLifetimeReward(supabase, {
    userId,
    fundingPaymentId: row?.id ?? null,
    coinpayPaymentId: event.coinpayPaymentId,
    amountUsd,
  });

  return true;
}

async function logFundingLifetimeReward(
  supabase: Db,
  p: { userId: string; fundingPaymentId: string | null; coinpayPaymentId: string; amountUsd: number }
) {
  const { data: existing } = await supabase
    .from("funding_rewards_log")
    .select("id, funding_payment_id, metadata")
    .eq("user_id", p.userId)
    .eq("reward_type", "lifetime");

  const alreadyLogged = (existing ?? []).some(
    (r: { funding_payment_id: string | null; metadata: unknown }) =>
      (p.fundingPaymentId && r.funding_payment_id === p.fundingPaymentId) ||
      asRecord(r.metadata).coinpay_payment_id === p.coinpayPaymentId
  );
  if (alreadyLogged) return;

  const { error } = await supabase.from("funding_rewards_log").insert({
    user_id: p.userId,
    funding_payment_id: p.fundingPaymentId,
    reward_type: "lifetime",
    amount: null,
    metadata: {
      coinpay_payment_id: p.coinpayPaymentId,
      amount_usd: p.amountUsd,
      threshold_usd: FUNDING_LIFETIME_THRESHOLD_USD,
    },
  });
  if (error) console.error("[coinpay webhook] funding reward log failed:", error);
}

/**
 * Mark a pending checkout payment failed/expired. Never touches a settled row.
 * Returns the updated row, or null when nothing changed.
 */
export async function markCheckoutPaymentUnpaid(
  supabase: Db,
  coinpayPaymentId: string,
  status: "expired" | "failed"
): Promise<Record<string, any> | null> {
  const { data } = await supabase
    .from("payments")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("coinpay_payment_id", coinpayPaymentId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  return data ?? null;
}
