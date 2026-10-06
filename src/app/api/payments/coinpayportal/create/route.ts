import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, requireFullAccess } from "@/lib/auth/get-user";
import { createPayment, type SupportedCurrency } from "@/lib/coinpayportal";
import { z } from "zod";
import {
  COINPAY_PLAN_PRICES_USD,
  formatUsd,
  hasPaidAccess,
  type CoinPayPlan,
} from "@/lib/plans";

const createPaymentSchema = z.object({
  type: z.enum(["subscription", "gig_payment", "tip", "funding"]),
  plan: z.enum(["monthly", "annual", "lifetime"]).optional(),
  currency: z.enum(["usdc_pol", "usdc_sol", "pol", "sol", "btc", "eth", "usdc_eth", "usdt"]),
  amount_usd: z.number().min(1).optional(),
});

// POST /api/payments/coinpayportal/create - Create a new payment
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const fullAccessError = requireFullAccess(auth);
    if (fullAccessError) return fullAccessError;

    const { user, supabase } = auth;

    const body = await request.json();
    const validationResult = createPaymentSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { type, plan, currency, amount_usd } = validationResult.data;

    if (type === "gig_payment") {
      return NextResponse.json(
        { error: "Gig payments must be paid through invoices" },
        { status: 400 }
      );
    }

    // Determine amount based on type
    let amount: number;
    let description: string;

    // Subscriptions default to monthly; the plan is stored on the local row so
    // the webhook grants the right period (or Lifetime).
    const subscriptionPlan: CoinPayPlan | undefined =
      type === "subscription" ? (plan ?? "monthly") : undefined;

    if (subscriptionPlan) {
      const { data: currentSub } = await supabase
        .from("subscriptions")
        .select("plan, status, stripe_subscription_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (currentSub?.plan === "lifetime") {
        return NextResponse.json(
          { error: "You already have a Lifetime membership" },
          { status: 400 }
        );
      }
      if (
        subscriptionPlan !== "lifetime" &&
        currentSub?.stripe_subscription_id &&
        hasPaidAccess(currentSub)
      ) {
        return NextResponse.json(
          {
            error:
              "You already have an active Pro subscription from the old billing system. Cancel it before paying with crypto.",
          },
          { status: 400 }
        );
      }
    }

    switch (type) {
      case "subscription":
        amount = COINPAY_PLAN_PRICES_USD[subscriptionPlan!];
        if (subscriptionPlan === "lifetime") {
          description = `ugig.net Lifetime Membership (One-time, ${formatUsd(amount)})`;
        } else if (subscriptionPlan === "annual") {
          description = `ugig.net Pro Subscription (Annual, ${formatUsd(amount)}/year)`;
        } else {
          description = `ugig.net Pro Subscription (Monthly, ${formatUsd(amount)}/month)`;
        }
        break;
      case "tip":
      case "funding":
        if (!amount_usd) {
          return NextResponse.json({ error: `amount_usd required for ${type}` }, { status: 400 });
        }
        amount = amount_usd;
        description = type === "funding" ? "ugig.net funding" : "Tip";
        break;
      default:
        return NextResponse.json({ error: "Invalid payment type" }, { status: 400 });
    }

    const businessId = process.env.COINPAY_MERCHANT_ID;

    // Create payment with the site-wide CoinPay business.
    const paymentResult = await createPayment({
      amount_usd: amount,
      currency: currency as SupportedCurrency,
      description,
      business_id: businessId,
      redirect_url: `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net"}/settings/billing?payment=success`,
      metadata: {
        user_id: user.id,
        type,
        ...(subscriptionPlan ? { plan: subscriptionPlan } : {}),
      },
    });

    // Create local payment record
    const { data: payment, error } = await supabase
      .from("payments")
      .insert({
        user_id: user.id,
        coinpay_payment_id: paymentResult.payment_id || (paymentResult.payment as any)?.id,
        amount_usd: amount,
        currency,
        status: "pending",
        type: type as any,
        metadata: {
          checkout_url: paymentResult.checkout_url,
          expires_at: paymentResult.expires_at,
          ...(subscriptionPlan ? { plan: subscriptionPlan } : {}),
        },
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create payment record:", error);
      return NextResponse.json({ error: "Failed to create payment" }, { status: 500 });
    }

    // Extract fields from CoinPayPortal response (may be at root or nested in .payment)
    const cpPayment = paymentResult.payment || paymentResult;
    const paymentAddress = (cpPayment as any).payment_address || paymentResult.address || null;
    const checkoutUrl = paymentResult.checkout_url || (cpPayment as any).checkout_url || null;
    const amountCrypto =
      paymentResult.amount_crypto ||
      (cpPayment as any).amount_crypto ||
      (cpPayment as any).crypto_amount;
    const expiresAt = paymentResult.expires_at || (cpPayment as any).expires_at;

    return NextResponse.json({
      payment_id: payment.id,
      checkout_url: checkoutUrl,
      address: paymentAddress,
      amount_crypto: amountCrypto,
      currency: paymentResult.currency || (cpPayment as any).currency,
      expires_at: expiresAt,
    });
  } catch (error) {
    console.error("Payment creation error:", error);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
