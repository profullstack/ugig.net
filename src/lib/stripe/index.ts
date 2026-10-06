import Stripe from "stripe";

/*
 * Stripe is retired as a payment rail: no new card checkouts are offered and
 * POST /api/subscriptions/checkout returns 410. This client remains only for
 * the webhook, portal and cancel routes in case a legacy Stripe subscriber
 * exists. Prices live in src/lib/plans.ts.
 */

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
