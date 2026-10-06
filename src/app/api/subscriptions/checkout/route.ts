import { NextResponse } from "next/server";
import {
  LIFETIME_PRICE_USD,
  PRO_ANNUAL_PRICE_USD,
  PRO_MONTHLY_PRICE_USD,
  formatUsd,
} from "@/lib/plans";

/**
 * POST /api/subscriptions/checkout - retired.
 *
 * Card checkout (Stripe) is no longer offered. Pro and Lifetime are sold only
 * through CoinPay (crypto): POST /api/payments/coinpayportal/create with
 * { type: "subscription", plan: "monthly" | "annual" | "lifetime", currency }.
 * No subscription on prod was ever billed through Stripe, so nothing else
 * depends on this route; the Stripe webhook and portal routes stay only so a
 * legacy Stripe subscriber could still be managed.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: `Card checkout is no longer available. Pay with crypto through CoinPay: Pro ${formatUsd(
        PRO_MONTHLY_PRICE_USD
      )}/month or ${formatUsd(PRO_ANNUAL_PRICE_USD)}/year, Lifetime ${formatUsd(
        LIFETIME_PRICE_USD
      )} one-time.`,
      checkout: {
        method: "POST",
        url: "/api/payments/coinpayportal/create",
        body: { type: "subscription", plan: "monthly | annual | lifetime", currency: "usdc_pol" },
      },
      page: "/dashboard/subscription",
    },
    { status: 410 }
  );
}
