import Stripe from "stripe";

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

export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    postsPerMonth: 10,
  },
  pro: {
    name: "Pro",
    priceMonthly: 900, // cents - $9/month
    priceAnnual: 7200, // cents - $72/year ($6/month)
    price: 900, // default to monthly for backwards compat
    postsPerMonth: Infinity,
    priceId: process.env.STRIPE_PRO_PRICE_ID,
  },
} as const;
