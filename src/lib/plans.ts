/**
 * Single source of truth for ugig.net plans, prices and perks.
 *
 * Every page, API route, doc example and email that shows or checks a price,
 * a plan name or a perk reads it from here. Do not hard-code "$9" or "10 posts"
 * anywhere else.
 *
 * Client-safe: no server-only imports.
 */
import { SKILL_FEE_RATES } from "@/lib/constants";

export type PlanId = "free" | "pro" | "lifetime";

/** Billing options. CoinPay (crypto) is the only payment rail; there is no card checkout. */
export type CoinPayPlan = "monthly" | "annual" | "lifetime";

/** Free accounts may publish this many gigs (hiring gigs and for-hire ads) per calendar month. */
export const FREE_MONTHLY_GIG_POSTS = 10;

/** Pro, billed monthly. Crypto, via CoinPay. */
export const PRO_MONTHLY_PRICE_USD = 9;
/** Pro, billed yearly. Crypto, via CoinPay. */
export const PRO_ANNUAL_PRICE_USD = 90;
/** Lifetime membership, one-time. Crypto, via CoinPay. Same perks as Pro, forever. */
export const LIFETIME_PRICE_USD = 100;

/** USD charged by POST /api/payments/coinpayportal/create for each subscription plan. */
export const COINPAY_PLAN_PRICES_USD: Record<CoinPayPlan, number> = {
  monthly: PRO_MONTHLY_PRICE_USD,
  annual: PRO_ANNUAL_PRICE_USD,
  lifetime: LIFETIME_PRICE_USD,
};

/** Months of Pro granted by a CoinPay payment for each recurring plan. */
export const COINPAY_PLAN_PERIOD_MONTHS: Record<Exclude<CoinPayPlan, "lifetime">, number> = {
  monthly: 1,
  annual: 12,
};

/** Grace period after current_period_end before an unpaid CoinPay Pro plan drops to Free. */
export const COINPAY_PRO_GRACE_DAYS = 3;

/** Contributing at least this much on /funding grants a Lifetime membership. */
export const FUNDING_LIFETIME_THRESHOLD_USD = 50;

function percent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

/** What every account gets. */
export const FREE_PERKS: readonly string[] = [
  `Post up to ${FREE_MONTHLY_GIG_POSTS} gigs per month`,
  "Apply to unlimited gigs",
  "Messaging and video calls",
  `${percent(SKILL_FEE_RATES.free)} marketplace seller fee`,
];

/**
 * What Pro and Lifetime add. Only list perks the code actually enforces
 * (see isPaidPlan call sites).
 */
export const PAID_PERKS: readonly string[] = [
  "Unlimited gig posts",
  `${percent(SKILL_FEE_RATES.pro)} marketplace seller fee instead of ${percent(SKILL_FEE_RATES.free)}`,
];

export const PLANS = {
  free: {
    id: "free" as const,
    name: "Free",
    priceUsd: 0,
    postsPerMonth: FREE_MONTHLY_GIG_POSTS,
    perks: FREE_PERKS,
  },
  pro: {
    id: "pro" as const,
    name: "Pro",
    monthlyUsd: PRO_MONTHLY_PRICE_USD,
    annualUsd: PRO_ANNUAL_PRICE_USD,
    postsPerMonth: Infinity,
    perks: PAID_PERKS,
  },
  lifetime: {
    id: "lifetime" as const,
    name: "Lifetime",
    oneTimeUsd: LIFETIME_PRICE_USD,
    postsPerMonth: Infinity,
    perks: PAID_PERKS,
  },
} as const;

/** Human copy for the rails each price is sold on. */
export const PRICE_RAILS_COPY = {
  monthly: "crypto, via CoinPay",
  annual: "crypto, via CoinPay",
  lifetime: "crypto, via CoinPay",
} as const;

/** Pro and Lifetime are the paid plans; they get the same perks everywhere. */
export function isPaidPlan(plan: string | null | undefined): plan is "pro" | "lifetime" {
  return plan === "pro" || plan === "lifetime";
}

/**
 * Whether a subscriptions row currently grants paid perks. Lifetime never
 * lapses; Pro counts while active or trialing (the expire-subscriptions cron
 * moves a lapsed CoinPay Pro back to free; any legacy Stripe subscription is
 * moved to canceled/past_due by its webhook).
 */
export function hasPaidAccess(
  subscription: { plan?: string | null; status?: string | null } | null | undefined
): boolean {
  if (!subscription || !isPaidPlan(subscription.plan)) return false;
  if (subscription.plan === "lifetime") return true;
  return !subscription.status || subscription.status === "active" || subscription.status === "trialing";
}

/** "$9", "$90", "$100": whole-dollar prices without cents. */
export function formatUsd(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}
