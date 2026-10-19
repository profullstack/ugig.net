import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/get-user";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";
import { paypalBuyNowEnabled } from "@/lib/orders/buy-now";
import {
  loadPaypalPayoutEmail,
  paypalEmailSchema,
  savePaypalPayoutEmail,
} from "@/lib/orders/paypal-payout";

/**
 * The caller's PayPal payout email (private; see lib/orders/paypal-payout.ts).
 * Saving one makes the caller's fixed-price for-hire listings buyable by card
 * or PayPal even without a crypto wallet. API keys work, no browser needed.
 */

const putSchema = z.object({ paypal_email: paypalEmailSchema.nullable() });

function body(email: string | null) {
  return {
    paypal_email: email,
    paypal_buy_now: paypalBuyNowEnabled(),
    note: email
      ? "Buyers can pay your fixed-price for-hire listings by card or PayPal. When an order is released, ugig sends the price minus its fee to this PayPal account."
      : "No PayPal payout email saved. Without one (or a crypto payout wallet), buyers can't use Buy now on your listings.",
  };
}

// GET /api/profile/payout-paypal
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(body(await loadPaypalPayoutEmail(auth.user.id)));
}

// PUT /api/profile/payout-paypal  {"paypal_email": "you@example.com" | null}
export async function PUT(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(getRateLimitIdentifier(request, auth.user.id), "write");
  if (!rl.allowed) return rateLimitExceeded(rl);

  const parsed = putSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  try {
    await savePaypalPayoutEmail(auth.user.id, parsed.data.paypal_email);
  } catch (error) {
    console.error("[payout-paypal] save failed:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
  return NextResponse.json(body(parsed.data.paypal_email));
}

// DELETE /api/profile/payout-paypal
export async function DELETE(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await savePaypalPayoutEmail(auth.user.id, null);
  } catch (error) {
    console.error("[payout-paypal] clear failed:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
  return NextResponse.json(body(null));
}
