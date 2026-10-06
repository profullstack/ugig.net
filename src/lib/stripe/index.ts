import Stripe from "stripe";
import { FREE_MONTHLY_GIG_POSTS, PRO_MONTHLY_PRICE_USD } from "@/lib/plans";

function createStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    // Return a proxy that throws on use — avoids crashing at module load during build
    return new Proxy({} as Stripe, {
      get(_, prop) {
        if (prop === "then") return undefined; // not a thenable
        throw new Error("STRIPE_SECRET_KEY is not configured");
      },
    });
  }
  return new Stripe(key);
}

export const stripe = createStripeClient();

/**
 * Stripe view of the plans. Prices come from src/lib/plans.ts. Stripe sells
 * only Pro monthly; annual and lifetime are crypto-only via CoinPay.
 */
export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    postsPerMonth: FREE_MONTHLY_GIG_POSTS,
  },
  pro: {
    name: "Pro",
    priceMonthly: PRO_MONTHLY_PRICE_USD * 100, // cents
    price: PRO_MONTHLY_PRICE_USD * 100, // cents, monthly
    postsPerMonth: Infinity,
    priceId: process.env.STRIPE_PRO_PRICE_ID,
  },
} as const;
