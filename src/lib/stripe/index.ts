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
    price: 599, // cents
    postsPerMonth: Infinity,
    priceId: process.env.STRIPE_PRO_PRICE_ID,
  },
} as const;
