import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { getPaymentStatus } from "@/lib/coinpayportal";
import {
  mapCoinPayStatus,
  markCheckoutPaymentUnpaid,
  settleCheckoutPayment,
} from "@/lib/payments/checkout-settlement";

/** Local statuses that a poll never changes. */
const TERMINAL_STATUSES = ["forwarded", "failed", "expired"];

/**
 * GET /api/payments/coinpayportal/status?payment_id=X
 *
 * Poll a checkout payment (payment_id is the local payments.id returned by
 * POST /api/payments/coinpayportal/create). Checks CoinPay directly and, when
 * the provider reports a change, applies it through the same settlement code
 * as the webhook (so a poll that sees the payment first still activates the
 * plan, once). Falls back to the local row if CoinPay is unreachable.
 *
 * Writes go through the service client: the payments UPDATE policy is
 * service-role only, so the user's client could never write.
 */
export async function GET(request: NextRequest) {
  try {
    const paymentId = request.nextUrl.searchParams.get("payment_id");
    if (!paymentId) {
      return NextResponse.json({ error: "payment_id is required" }, { status: 400 });
    }

    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = createServiceClient();

    // Verify the payment belongs to this user
    const { data: payment, error } = await service
      .from("payments")
      .select("id, coinpay_payment_id, status, updated_at")
      .eq("id", paymentId)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error || !payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (TERMINAL_STATUSES.includes(payment.status as string)) {
      return NextResponse.json({ status: payment.status, updated_at: payment.updated_at });
    }

    if (payment.coinpay_payment_id) {
      try {
        const cpStatus = await getPaymentStatus(payment.coinpay_payment_id);
        if (cpStatus.success && cpStatus.payment) {
          const providerStatus = cpStatus.payment.status;
          const mapped = mapCoinPayStatus(providerStatus);
          let status: string = payment.status as string;

          if (mapped === "confirmed" || mapped === "forwarded") {
            if (mapped !== payment.status) {
              await settleCheckoutPayment(service, {
                coinpayPaymentId: payment.coinpay_payment_id,
                status: mapped,
                amountCrypto: cpStatus.payment.crypto_amount,
                txHash: cpStatus.payment.tx_hash ?? null,
                merchantTxHash: cpStatus.payment.forward_tx_hash ?? null,
              });
              status = mapped;
            }
          } else if ((mapped === "expired" || mapped === "failed") && payment.status === "pending") {
            await markCheckoutPaymentUnpaid(service, payment.coinpay_payment_id, mapped);
            status = mapped;
          }

          return NextResponse.json({
            status,
            provider_status: providerStatus,
            tx_hash: cpStatus.payment.tx_hash,
            updated_at: payment.updated_at,
          });
        }
      } catch (cpError) {
        console.error("CoinPayPortal status check failed:", cpError);
        // Fall through to return local DB state
      }
    }

    return NextResponse.json({ status: payment.status, updated_at: payment.updated_at });
  } catch (error) {
    console.error("Payment status error:", error);
    return NextResponse.json({ error: "Failed to check payment status" }, { status: 500 });
  }
}
