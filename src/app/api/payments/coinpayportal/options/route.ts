import { NextResponse } from "next/server";
import { listCheckoutCoins, paypalCheckoutEnabled } from "@/lib/payments/pro-checkout";
import { COINPAY_PLAN_PRICES_USD } from "@/lib/plans";

/**
 * GET /api/payments/coinpayportal/options
 *
 * What POST /api/payments/coinpayportal/create accepts for Pro and Lifetime:
 * the plan prices, every coin ugig's CoinPay business takes right now, and
 * whether PayPal (and card, through PayPal guest checkout) is on. Public.
 */
export async function GET() {
  const coins = await listCheckoutCoins();
  return NextResponse.json(
    {
      plans: Object.entries(COINPAY_PLAN_PRICES_USD).map(([plan, amount_usd]) => ({ plan, amount_usd })),
      methods: paypalCheckoutEnabled() ? ["crypto", "paypal"] : ["crypto"],
      coins,
      checkout_page: "/checkout?plan=monthly",
    },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
