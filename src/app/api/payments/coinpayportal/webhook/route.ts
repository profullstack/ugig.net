import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  verifyWebhookSignature,
  type CoinPayWebhookPayload,
} from "@/lib/coinpayportal";

// POST /api/payments/coinpayportal/webhook - Handle CoinPayPortal webhooks
export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get("X-CoinPay-Signature");
    const rawBody = await request.text();

    // Verify signature
    const webhookSecret = process.env.COINPAYPORTAL_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("COINPAYPORTAL_WEBHOOK_SECRET not configured");
      return NextResponse.json(
        { error: "Webhook not configured" },
        { status: 500 }
      );
    }

    if (!signature || !verifyWebhookSignature(rawBody, signature, webhookSecret)) {
      console.error("Invalid webhook signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const payload: CoinPayWebhookPayload = JSON.parse(rawBody);
    const supabase = await createClient();

    console.log(`CoinPayPortal webhook: ${payload.event}`, {
      payment_id: payload.payment_id,
      amount_usd: payload.amount_usd,
      status: payload.status,
    });

    switch (payload.event) {
      case "payment.confirmed": {
        // Payment confirmed - update payment record and activate subscription/service
        await handlePaymentConfirmed(supabase, payload);
        break;
      }

      case "payment.forwarded": {
        // Funds forwarded to merchant wallet - update payment with tx hash
        await handlePaymentForwarded(supabase, payload);
        break;
      }

      case "payment.expired": {
        // Payment expired - mark as expired
        await handlePaymentExpired(supabase, payload);
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${payload.event}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

async function handlePaymentConfirmed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: CoinPayWebhookPayload
) {
  // Update payment status
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .update({
      status: "confirmed",
      amount_crypto: payload.amount_crypto,
      updated_at: new Date().toISOString(),
    })
    .eq("coinpay_payment_id", payload.payment_id)
    .select()
    .single();

  if (paymentError) {
    console.error("Failed to update payment:", paymentError);
    return;
  }

  if (!payment) {
    console.error("Payment not found:", payload.payment_id);
    return;
  }

  // Handle based on payment type
  if (payment.type === "subscription") {
    // Activate Pro subscription
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await supabase
      .from("subscriptions")
      .upsert({
        user_id: payment.user_id,
        coinpay_payment_id: payload.payment_id,
        status: "active",
        plan: "pro",
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
        updated_at: now.toISOString(),
      }, {
        onConflict: "user_id",
      });

    // Notify user
    await supabase.from("notifications").insert({
      user_id: payment.user_id,
      type: "payment_received",
      title: "Pro subscription activated",
      body: `Your Pro subscription is now active. Enjoy unlimited gig posts!`,
      data: {
        payment_id: payment.id,
        amount_usd: payload.amount_usd,
        currency: payload.currency,
      },
    });
  }

  // Handle other payment types as needed
}

async function handlePaymentForwarded(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: CoinPayWebhookPayload
) {
  // Update payment with forwarding info
  await supabase
    .from("payments")
    .update({
      status: "forwarded",
      metadata: {
        tx_hash: payload.tx_hash,
        forwarded_tx_hash: payload.forwarded_tx_hash,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("coinpay_payment_id", payload.payment_id);
}

async function handlePaymentExpired(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: CoinPayWebhookPayload
) {
  // Mark payment as expired
  const { data: payment } = await supabase
    .from("payments")
    .update({
      status: "expired",
      updated_at: new Date().toISOString(),
    })
    .eq("coinpay_payment_id", payload.payment_id)
    .select()
    .single();

  if (payment) {
    // Notify user
    await supabase.from("notifications").insert({
      user_id: payment.user_id,
      type: "payment_received",
      title: "Payment expired",
      body: "Your payment request has expired. Please try again.",
      data: {
        payment_id: payment.id,
      },
    });
  }
}
