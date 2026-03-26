import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const COINPAYPORTAL_API_URL = "https://coinpayportal.com/api";

/**
 * POST /api/funding/stripe-checkout
 * Create a Stripe checkout session via CoinPayPortal for funding.
 */
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
    const { amount_usd } = body;

    if (!amount_usd || amount_usd < 1) {
      return NextResponse.json(
        { error: "Amount must be at least $1" },
        { status: 400 }
      );
    }

    const businessId =
      process.env.COINPAYPORTAL_UGIG_BUSINESS_ID ||
      process.env.COINPAYPORTAL_MERCHANT_ID;
    const apiKey = process.env.COINPAYPORTAL_API_KEY;

    if (!businessId || !apiKey) {
      return NextResponse.json(
        { error: "Payment service not configured" },
        { status: 503 }
      );
    }

    const appUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://ugig.net";

    // Call CoinPayPortal's Stripe checkout endpoint
    const res = await fetch(`${COINPAYPORTAL_API_URL}/stripe/payments/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        businessId,
        amount: Math.round(amount_usd * 100), // Stripe expects cents
        currency: "usd",
        description: `ugig.net funding - $${amount_usd}`,
        metadata: {
          user_id: user.id,
          type: "tip",
          amount_usd: amount_usd.toString(),
        },
        successUrl: `${appUrl}/funding?payment=success`,
        cancelUrl: `${appUrl}/funding?payment=cancelled`,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("CoinPayPortal Stripe checkout error:", data);
      return NextResponse.json(
        { error: data.error || "Failed to create checkout" },
        { status: res.status }
      );
    }

    return NextResponse.json({
      checkout_url: data.checkout_url,
    });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
