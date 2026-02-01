import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPayment, type SupportedCurrency } from "@/lib/coinpayportal";
import { z } from "zod";

const createPaymentSchema = z.object({
  type: z.enum(["subscription", "gig_payment", "tip"]),
  plan: z.enum(["monthly", "annual"]).optional(),
  currency: z.enum(["usdc_pol", "usdc_sol", "pol", "sol", "btc", "eth", "usdc_eth", "usdt"]),
  amount_usd: z.number().min(1).optional(),
  gig_id: z.string().uuid().optional(),
});

// POST /api/payments/coinpayportal/create - Create a new payment
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validationResult = createPaymentSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { type, plan, currency, amount_usd, gig_id } = validationResult.data;

    // Determine amount based on type
    let amount: number;
    let description: string;

    switch (type) {
      case "subscription":
        if (plan === "annual") {
          amount = 108; // $108/year ($9/month)
          description = "ugig.net Pro Subscription (Annual - $9/mo)";
        } else {
          amount = 29; // $29/month
          description = "ugig.net Pro Subscription (Monthly)";
        }
        break;
      case "gig_payment":
        if (!amount_usd || !gig_id) {
          return NextResponse.json(
            { error: "amount_usd and gig_id required for gig payments" },
            { status: 400 }
          );
        }
        amount = amount_usd;
        description = `Gig payment for ${gig_id}`;
        break;
      case "tip":
        if (!amount_usd) {
          return NextResponse.json(
            { error: "amount_usd required for tips" },
            { status: 400 }
          );
        }
        amount = amount_usd;
        description = "Tip";
        break;
      default:
        return NextResponse.json(
          { error: "Invalid payment type" },
          { status: 400 }
        );
    }

    // Create payment with CoinPayPortal
    const paymentResult = await createPayment({
      amount_usd: amount,
      currency: currency as SupportedCurrency,
      description,
      redirect_url: `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net"}/settings/billing?payment=success`,
      metadata: {
        user_id: user.id,
        type,
        gig_id,
      },
    });

    // Create local payment record
    const { data: payment, error } = await supabase
      .from("payments")
      .insert({
        user_id: user.id,
        coinpay_payment_id: paymentResult.payment_id,
        amount_usd: amount,
        currency,
        status: "pending",
        type,
        metadata: {
          gig_id,
          checkout_url: paymentResult.checkout_url,
          expires_at: paymentResult.expires_at,
        },
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create payment record:", error);
      return NextResponse.json(
        { error: "Failed to create payment" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      payment_id: payment.id,
      checkout_url: paymentResult.checkout_url,
      address: paymentResult.address,
      amount_crypto: paymentResult.amount_crypto,
      currency: paymentResult.currency,
      expires_at: paymentResult.expires_at,
    });
  } catch (error) {
    console.error("Payment creation error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
