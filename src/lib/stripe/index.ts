import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

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
