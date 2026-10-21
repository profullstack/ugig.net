import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, requireFullAccess } from "@/lib/auth/get-user";
import { randomUUID } from "node:crypto";
import { createCheckoutSession, createPayment, createPaypalPayment } from "@/lib/coinpayportal";
import {
  isCoinRefusal,
  listCheckoutCoins,
  markCoinBroken,
  paymentMetadata,
  paypalCheckoutEnabled,
  PAYMENT_PROPERTY,
} from "@/lib/payments/pro-checkout";
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
  /** "crypto" (default) or "paypal" (PayPal, or debit/credit card via PayPal guest checkout). */
  method: z.enum(["crypto", "paypal"]).default("crypto"),
  /** Any CoinPay coin code the business accepts (checked live), e.g. "usdc_pol", "doge". */
  currency: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{2,20}$/, "Invalid currency")
    .optional(),
  amount_usd: z.number().min(1).max(10000).optional(),
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

    const { type, plan, method, currency, amount_usd } = validationResult.data;

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

    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";
    const successUrl = `${appUrl}/settings/billing?payment=success`;
    const cancelUrl =
      type === "subscription" ? `${appUrl}/checkout?plan=${subscriptionPlan}&canceled=1` : `${appUrl}/funding`;

    // Validate the rail before anything is created.
    if (method === "paypal") {
      if (!paypalCheckoutEnabled()) {
        return NextResponse.json({ error: "PayPal is not available right now. Pay with crypto." }, { status: 400 });
      }
    } else {
      if (!currency) {
        return NextResponse.json({ error: "Choose a coin to pay with" }, { status: 400 });
      }
      const coins = await listCheckoutCoins();
      if (!coins.some((c) => c.value === currency)) {
        return NextResponse.json({ error: `CoinPay does not accept ${currency} for ugig.net` }, { status: 400 });
      }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();
    const username = (profile as { username?: string } | null)?.username ?? null;

    // The local row id is known before CoinPay is called, so every CoinPay
    // payment carries it and the webhook can always find its way back.
    const localId = randomUUID();
    const metadata = paymentMetadata(
      { userId: user.id, email: user.email, username },
      {
        ugig_payment_id: localId,
        type,
        plan: subscriptionPlan,
        rail: method === "paypal" ? "paypal" : "crypto",
      }
    );

    let coinpayId: string | null = null;
    let checkoutUrl: string | null = null;
    let rail: "hosted" | "paypal" | "crypto";
    let rowCurrency: string;
    let cryptoResult: Awaited<ReturnType<typeof createPayment>> | null = null;

    // Prefer CoinPay's hosted checkout session (every coin, PayPal and card on
    // one page) when CoinPay serves it; otherwise use the rail picked here.
    const session = await createCheckoutSession({
      amount_usd: amount,
      description,
      customer_email: user.email,
      account_id: user.id,
      property: PAYMENT_PROPERTY,
      metadata: { ...metadata, rail: "hosted" },
      success_url: successUrl,
      cancel_url: cancelUrl,
      expires_in_minutes: 60,
    }).catch((err) => {
      console.error("[coinpay] checkout session failed, using direct rail:", err);
      return null;
    });

    if (session) {
      rail = "hosted";
      rowCurrency = "hosted";
      checkoutUrl = session.url;
    } else if (method === "paypal") {
      const paypal = await createPaypalPayment({
        amount_usd: amount,
        description,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
        customer_email: user.email,
        customer_name: username ?? undefined,
      });
      rail = "paypal";
      rowCurrency = "paypal";
      coinpayId = paypal.transaction_id;
      checkoutUrl = paypal.checkout_url;
    } else {
      try {
        cryptoResult = await createPayment({
          amount_usd: amount,
          currency: currency!,
          description,
          business_id: process.env.COINPAY_MERCHANT_ID,
          redirect_url: successUrl,
          metadata,
          idempotency_key: localId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isCoinRefusal(message)) {
          markCoinBroken(currency!);
          return NextResponse.json(
            { error: `CoinPay cannot take ${currency!.toUpperCase()} right now. Pick another coin, or pay with PayPal or card.` },
            { status: 502 }
          );
        }
        throw err;
      }
      rail = "crypto";
      rowCurrency = currency!;
      const cp = (cryptoResult.payment || cryptoResult) as any;
      coinpayId = cryptoResult.payment_id || cp?.id || null;
      // CoinPay's hosted crypto page (QR, live status, return link) when the
      // create response carries no checkout_url of its own.
      checkoutUrl =
        cryptoResult.checkout_url ||
        cp?.checkout_url ||
        (coinpayId ? `https://coinpayportal.com/pay/${encodeURIComponent(coinpayId)}` : null);
    }

    const cpPayment = (cryptoResult?.payment || cryptoResult || {}) as any;
    const expiresAt =
      cryptoResult?.expires_at ||
      cpPayment.expires_at ||
      (rail === "crypto" ? undefined : new Date(Date.now() + 60 * 60 * 1000).toISOString());

    const { data: payment, error } = await supabase
      .from("payments")
      .insert({
        id: localId,
        user_id: user.id,
        coinpay_payment_id: coinpayId,
        amount_usd: amount,
        currency: rowCurrency,
        status: "pending",
        type: type as any,
        metadata: {
          checkout_url: checkoutUrl,
          expires_at: expiresAt,
          rail,
          property: PAYMENT_PROPERTY,
          ...(session ? { checkout_session_id: session.id } : {}),
          ...(subscriptionPlan ? { plan: subscriptionPlan } : {}),
        },
      })
      .select()
      .single();

    if (error) {
      // The CoinPay payment still carries user_id/plan/ugig_payment_id, so the
      // webhook can settle it without this row.
      console.error("Failed to create payment record:", error);
      return NextResponse.json({ error: "Failed to create payment" }, { status: 500 });
    }

    const paymentAddress = cpPayment.payment_address || cryptoResult?.address || null;
    const amountCrypto =
      cryptoResult?.amount_crypto || cpPayment.amount_crypto || cpPayment.crypto_amount || null;

    return NextResponse.json({
      payment_id: payment.id,
      rail,
      checkout_url: checkoutUrl,
      address: paymentAddress,
      amount_crypto: amountCrypto,
      currency: rail === "crypto" ? cryptoResult?.currency || cpPayment.currency || currency : rowCurrency,
      expires_at: expiresAt,
    });
  } catch (error) {
    console.error("Payment creation error:", error);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
