import { NextRequest } from "next/server";
import { POST as handleCoinPayWebhook } from "@/app/api/payments/coinpayportal/webhook/route";

/**
 * Dedicated CoinPay funding webhook endpoint.
 *
 * Delegates to the canonical CoinPay webhook handler which verifies
 * the X-CoinPay-Signature HMAC using COINPAYPORTAL_WEBHOOK_SECRET.
 */
export async function POST(request: NextRequest) {
  return handleCoinPayWebhook(request);
}
