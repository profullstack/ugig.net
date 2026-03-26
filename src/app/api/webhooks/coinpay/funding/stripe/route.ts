import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";

function getWebhookSecret(): string {
  return process.env.COINPAY_STRIPE_WEBHOOK_SECRET || "";
}

/**
 * POST /api/webhooks/coinpay/funding/stripe
 *
 * Receives Stripe Connect webhook events from CoinPayPortal.
 * Handles payment_intent.succeeded and charge.succeeded for card-funded contributions.
 *
 * The webhook is signed by Stripe using the whsec_ signing secret.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const sig = request.headers.get("stripe-signature");

    if (!sig) {
      return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
    }

    const webhookSecret = getWebhookSecret();
    if (!webhookSecret) {
      console.error("[CoinPay Stripe Webhook] COINPAY_STRIPE_WEBHOOK_SECRET not configured");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
    }

    // Verify Stripe signature using official SDK
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err) {
      console.error("[CoinPay Stripe Webhook] Signature verification failed:", (err as Error).message);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    console.log(`[CoinPay Stripe Webhook] Received event: ${event.type}`);

    switch (event.type) {
      case "checkout.session.completed":
      case "payment_intent.succeeded":
      case "charge.succeeded":
        await handlePaymentSucceeded(event.data.object as any);
        break;
      case "charge.refunded":
        await handleRefund(event.data.object as any);
        break;
      default:
        console.log(`[CoinPay Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[CoinPay Stripe Webhook] Error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}



/**
 * Handle a successful payment (payment_intent.succeeded or charge.succeeded).
 * Look up the funding_payment by Stripe payment ID and apply rewards.
 */
async function handlePaymentSucceeded(paymentObject: any) {
  if (!paymentObject) return;

  const supabase = createServiceClient();

  // Extract metadata — could be on payment_intent or charge
  const metadata = paymentObject.metadata || {};
  const userId = metadata.user_id;
  const amountUsd = paymentObject.amount
    ? paymentObject.amount / 100
    : parseFloat(metadata.amount_usd || "0");
  const paymentId = paymentObject.id;

  console.log(
    `[CoinPay Stripe Webhook] Payment succeeded: ${paymentId}, user=${userId}, amount=$${amountUsd}`
  );

  if (!userId) {
    console.error("[CoinPay Stripe Webhook] No user_id in payment metadata");
    return;
  }

  // Check if we already have a funding_payment for this Stripe payment
  const { data: existing } = await supabase
    .from("funding_payments")
    .select("id, status")
    .eq("stripe_payment_id", paymentId)
    .single();

  if (existing?.status === "paid") {
    console.log(`[CoinPay Stripe Webhook] Already processed: ${paymentId}`);
    return;
  }

  // Create or update funding_payment record
  if (existing) {
    await supabase
      .from("funding_payments")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    // Create a new funding_payment record for card payments
    const { error: insertError } = await (supabase.from("funding_payments") as any).insert({
      user_id: userId,
      amount_usd: amountUsd,
      amount_sats: 0, // Card payment, no sats
      stripe_payment_id: paymentId,
      tier: metadata.tier || determineTier(amountUsd),
      status: "paid",
      paid_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error("[CoinPay Stripe Webhook] Insert error:", insertError);
      return;
    }
  }

  // Apply rewards: credits based on USD amount
  const creditsToAward = Math.floor(amountUsd * 1000); // $1 = 1000 credits
  if (creditsToAward > 0) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits")
      .eq("id", userId)
      .single();

    const currentCredits = (profile?.credits as number) ?? 0;
    await supabase
      .from("profiles")
      .update({ credits: currentCredits + creditsToAward })
      .eq("id", userId);

    console.log(
      `[CoinPay Stripe Webhook] Awarded ${creditsToAward} credits to user ${userId}`
    );
  }

  // Notify user
  await supabase.from("notifications").insert({
    user_id: userId,
    type: "payment_received",
    title: "Card payment received! 💳",
    body: `Your $${amountUsd.toFixed(2)} funding payment was successful. ${creditsToAward.toLocaleString()} credits added to your account.`,
    data: { payment_id: paymentId, amount_usd: amountUsd, credits: creditsToAward },
  });
}

/**
 * Handle a refund event.
 */
async function handleRefund(chargeObject: any) {
  if (!chargeObject) return;

  const supabase = createServiceClient();
  const paymentId = chargeObject.payment_intent || chargeObject.id;

  console.log(`[CoinPay Stripe Webhook] Refund for: ${paymentId}`);

  // Mark funding_payment as refunded
  const { data: payment } = await supabase
    .from("funding_payments")
    .select("id, user_id, amount_usd")
    .eq("stripe_payment_id", paymentId)
    .single();

  if (payment) {
    await supabase
      .from("funding_payments")
      .update({ status: "refunded" })
      .eq("id", payment.id);

    // Reverse credits
    const creditsToRemove = Math.floor(Number(payment.amount_usd) * 1000);
    if (creditsToRemove > 0) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("credits")
        .eq("id", payment.user_id)
        .single();

      const currentCredits = (profile?.credits as number) ?? 0;
      await supabase
        .from("profiles")
        .update({ credits: Math.max(0, currentCredits - creditsToRemove) })
        .eq("id", payment.user_id);
    }

    await supabase.from("notifications").insert({
      user_id: payment.user_id,
      type: "payment_received",
      title: "Payment refunded",
      body: `Your $${Number(payment.amount_usd).toFixed(2)} funding payment has been refunded.`,
      data: { payment_id: paymentId },
    });
  }
}

/**
 * Determine funding tier based on USD amount.
 */
function determineTier(amountUsd: number): string {
  if (amountUsd >= 50) return "lifetime";
  if (amountUsd >= 10) return "supporter";
  return "credits_100k";
}
