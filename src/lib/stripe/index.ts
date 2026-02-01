import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return _stripe;
}

// Legacy export — getter that returns the singleton
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    postsPerMonth: 10,
  },
  pro: {
    name: "Pro",
    priceMonthly: 2900, // cents - $29/month
    priceAnnual: 10800, // cents - $108/year ($9/month)
    price: 2900, // default to monthly for backwards compat
    postsPerMonth: Infinity,
    priceId: process.env.STRIPE_PRO_PRICE_ID,
  },
} as const;
