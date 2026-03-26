import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createInvoice } from "@/lib/lnbits";
import {
  FUNDING_TIERS,
  VALID_FUNDING_TIERS,
  INVOICE_EXPIRY_SECONDS,
  type FundingTierId,
} from "@/lib/funding";

const createInvoiceSchema = z.object({
  tier: z.enum(VALID_FUNDING_TIERS as [FundingTierId, ...FundingTierId[]]),
});

/** Simple in-memory rate limiter: max 5 invoices per user per minute */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

/** Reset rate limiter (for testing) */
export function _resetRateLimit() {
  rateLimitMap.clear();
}

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // Auth
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit
    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { error: "Too many invoice requests. Please wait a moment." },
        { status: 429 }
      );
    }

    // Validate body
    const body = await request.json();
    const parsed = createInvoiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { tier } = parsed.data;
    const tierConfig = FUNDING_TIERS[tier];

    // Build webhook URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";
    const webhookUrl = `${baseUrl}/api/funding/lnbits-webhook`;

    // Create LNbits invoice
    const invoice = await createInvoice({
      amount: tierConfig.sats,
      memo: `ugig.net funding: ${tierConfig.label}`,
      expiry: INVOICE_EXPIRY_SECONDS,
      webhook: webhookUrl,
    });

    const expiresAt = new Date(
      Date.now() + INVOICE_EXPIRY_SECONDS * 1000
    ).toISOString();

    // Persist payment record via service client (bypasses RLS for insert with computed fields)
    const serviceClient = createServiceClient();
    const { error: insertError } = await serviceClient
      .from("funding_payments")
      .insert({
        user_id: user.id,
        payment_hash: invoice.payment_hash,
        bolt11: invoice.payment_request,
        tier,
        amount_sats: tierConfig.sats,
        amount_usd: tierConfig.usdValue,
        status: "pending",
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error("Failed to persist funding payment:", insertError);
      return NextResponse.json(
        { error: "Failed to create payment record" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      paymentRequest: invoice.payment_request,
      paymentHash: invoice.payment_hash,
      expiresAt,
      tier,
      amountSats: tierConfig.sats,
    });
  } catch (error) {
    console.error("Create funding invoice error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
