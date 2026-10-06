import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createCoinpayPayment,
  SUPPORTED_CURRENCIES,
  type CoinpayCurrency,
} from "@/lib/coinpay-client";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

// Crypto only: card checkout (CoinPay's Stripe leg) is not offered.
const SUPPORTED_KEYS = (Object.keys(SUPPORTED_CURRENCIES) as CoinpayCurrency[]).filter(
  (key) => key !== "card"
) as [CoinpayCurrency, ...CoinpayCurrency[]];

const Body = z.object({
  amount_usd: z.number().min(1).max(1_000_000),
  currency: z.enum(SUPPORTED_KEYS),
  contributor_name: z.string().trim().max(120).optional(),
  contributor_email: z.string().trim().email().max(200).optional(),
});

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = Body.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  let { contributor_name, contributor_email } = parsed.data;
  const { amount_usd, currency } = parsed.data;

  // If the requester is logged in, prefer their auth identity over any
  // form-supplied name/email. Funding is open to anonymous contributors.
  let userId: string | null = null;
  try {
    // Session or API key. An API-key context has no email, so read it from
    // the auth user rather than trusting the form.
    const auth = await getAuthContext(req);
    const user = auth?.user ?? null;
    if (user) {
      userId = user.id;
      const admin = createServiceClient();
      let email = user.email;
      if (!email && admin) {
        const { data: authUser } = await admin.auth.admin.getUserById(user.id);
        email = authUser?.user?.email ?? undefined;
      }
      if (email) contributor_email = email;
      if (admin) {
        const { data: profile } = await admin
          .from("profiles")
          .select("full_name, username")
          .eq("id", user.id)
          .maybeSingle();
        if (profile?.full_name) contributor_name = profile.full_name;
        else if (profile?.username) contributor_name = profile.username;
      }
    }
  } catch (e) {
    console.error("[funding/create-invoice] session lookup failed", e);
  }

  let cp;
  try {
    cp = await createCoinpayPayment({
      amount_usd,
      currency,
      description: `ugig funding ($${amount_usd})`,
      metadata: {
        contributor_name: contributor_name ?? null,
        contributor_email: contributor_email ?? null,
        user_id: userId,
      },
    });
  } catch (e) {
    console.error("[funding/create-invoice] coinpay create failed", e);
    return NextResponse.json(
      { error: (e as Error).message || "CoinPay request failed" },
      { status: 502 }
    );
  }

  const payment = cp.payment ?? {};
  const paymentId = cp.payment_id ?? payment.id;
  const address = cp.address ?? payment.payment_address ?? null;
  const amountCrypto =
    cp.amount_crypto ?? payment.amount_crypto ?? payment.crypto_amount ?? null;
  const expiresAt = cp.expires_at ?? payment.expires_at ?? null;
  const checkoutUrl =
    payment.stripe_checkout_url ?? cp.checkout_url ?? payment.checkout_url ?? null;
  const respCurrency = cp.currency ?? payment.currency ?? currency;

  if (!paymentId) {
    return NextResponse.json(
      { error: "CoinPay did not return a payment id" },
      { status: 502 }
    );
  }

  const supabase = createServiceClient();
  if (supabase) {
    const { error } = await (supabase.from("funding_payments") as any).insert({
      user_id: userId,
      coinpay_payment_id: paymentId,
      amount_usd,
      amount_crypto: amountCrypto,
      // Preserve the user's chosen rail. CoinPay returns usdc_pol for
      // card payments (since they're routed through Stripe), but we
      // want to render "Credit Card (via CoinPay)" not "USDC_POL".
      currency: currency === "card" ? "card" : respCurrency,
      status: "pending",
      contributor_name: contributor_name ?? null,
      contributor_email: contributor_email ?? null,
      metadata: { checkout_url: checkoutUrl, expires_at: expiresAt },
    });
    if (error) {
      console.error("[funding/create-invoice] insert failed:", error);
      return NextResponse.json(
        { error: "Failed to record payment" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    payment_id: paymentId,
    address,
    amount_crypto: amountCrypto,
    currency: respCurrency,
    expires_at: expiresAt,
    checkout_url: checkoutUrl,
  });
}
