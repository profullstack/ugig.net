import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkPayment } from "@/lib/lnbits";
import { FUNDING_TIERS, LIFETIME_THRESHOLD_USD } from "@/lib/funding";

/**
 * POST /api/funding/lnbits-webhook
 *
 * Called by LNbits when a funding invoice is paid.
 * Verifies payment server-side, applies rewards idempotently.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const paymentHash = body.payment_hash;

    if (!paymentHash || typeof paymentHash !== "string") {
      return NextResponse.json({ error: "Missing payment_hash" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Look up the pending funding payment
    const { data: payment, error: lookupError } = await supabase
      .from("funding_payments")
      .select("*")
      .eq("payment_hash", paymentHash)
      .single();

    if (lookupError || !payment) {
      console.error("Funding payment not found for hash:", paymentHash);
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // Idempotency: already paid
    if (payment.status === "paid") {
      return NextResponse.json({ ok: true, message: "Already processed" });
    }

    // Server-side verification: check with LNbits that payment is actually paid
    const lnbitsStatus = await checkPayment(paymentHash);
    if (!lnbitsStatus.paid) {
      console.log("LNbits reports payment not yet paid:", paymentHash);
      return NextResponse.json({ error: "Payment not confirmed" }, { status: 402 });
    }

    // Mark payment as paid
    const { error: updateError } = await supabase
      .from("funding_payments")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", payment.id)
      .eq("status", "pending"); // optimistic lock

    if (updateError) {
      console.error("Failed to update funding payment:", updateError);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    // Apply rewards
    const tier = payment.tier as keyof typeof FUNDING_TIERS;
    const tierConfig = FUNDING_TIERS[tier];
    const rewards: Array<{
      user_id: string;
      funding_payment_id: string;
      reward_type: string;
      amount: number | null;
      metadata: Record<string, string | number>;
    }> = [];

    // 1. Credits reward
    if (tierConfig && tierConfig.creditsAwarded > 0) {
      // Add credits to user profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("credits")
        .eq("id", payment.user_id)
        .single();

      const currentCredits = (profile?.credits as number) ?? 0;
      await supabase
        .from("profiles")
        .update({ credits: currentCredits + tierConfig.creditsAwarded })
        .eq("id", payment.user_id);

      rewards.push({
        user_id: payment.user_id,
        funding_payment_id: payment.id,
        reward_type: "credits",
        amount: tierConfig.creditsAwarded,
        metadata: { tier, sats: payment.amount_sats },
      });
    }

    // 2. Lifetime premium if amount_usd >= threshold
    const amountUsd = Number(payment.amount_usd) || 0;
    if (amountUsd >= LIFETIME_THRESHOLD_USD) {
      // Upgrade subscription to lifetime
      const { data: existingSub } = await supabase
        .from("subscriptions")
        .select("id, plan")
        .eq("user_id", payment.user_id)
        .single();

      if (existingSub) {
        await supabase
          .from("subscriptions")
          .update({ plan: "lifetime", status: "active" })
          .eq("id", existingSub.id);
      } else {
        await supabase
          .from("subscriptions")
          .insert({
            user_id: payment.user_id,
            plan: "lifetime",
            status: "active",
            cancel_at_period_end: false,
          });
      }

      rewards.push({
        user_id: payment.user_id,
        funding_payment_id: payment.id,
        reward_type: "lifetime",
        amount: null,
        metadata: { amount_usd: amountUsd, tier },
      });
    }

    // 3. Supporter badge
    if (tier === "supporter") {
      rewards.push({
        user_id: payment.user_id,
        funding_payment_id: payment.id,
        reward_type: "badge",
        amount: null,
        metadata: { badge: "supporter", sats: payment.amount_sats },
      });
    }

    // Write all rewards
    if (rewards.length > 0) {
      const { error: rewardError } = await supabase
        .from("funding_rewards_log")
        .insert(rewards);

      if (rewardError) {
        console.error("Failed to write rewards log:", rewardError);
      }
    }

    console.log(`Funding payment processed: ${paymentHash}, tier=${tier}, rewards=${rewards.length}`);
    return NextResponse.json({ ok: true, rewards: rewards.length });
  } catch (error) {
    console.error("LNbits webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
