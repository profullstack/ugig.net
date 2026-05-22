import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  verifyWebhookSignature,
  type CoinPayWebhookPayload,
} from "@/lib/coinpayportal";
import { LIFETIME_THRESHOLD_USD } from "@/lib/funding";

// POST /api/payments/coinpayportal/webhook - Handle CoinPayPortal webhooks
export async function POST(request: NextRequest) {
  return processCoinPayWebhook(request, process.env.COINPAY_UGIG_CRYPTO_WEBHOOK_SECRET);
}

export async function processCoinPayWebhook(request: NextRequest, webhookSecret: string | undefined) {
  try {
    const signature = request.headers.get("X-CoinPay-Signature");
    const rawBody = await request.text();

    if (!webhookSecret) {
      console.error("CoinPay webhook secret not configured");
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
    const supabase = createServiceClient();

    console.log(`CoinPayPortal webhook: ${payload.type}`, {
      payment_id: payload.data.payment_id,
      amount_usd: payload.data.amount_usd,
      status: payload.data.status,
    });

    switch (payload.type) {
      case "payment.confirmed": {
        await handlePaymentConfirmed(supabase, payload);
        break;
      }

      case "payment.forwarded": {
        await handlePaymentForwarded(supabase, payload);
        break;
      }

      case "payment.expired": {
        await handlePaymentExpired(supabase, payload);
        break;
      }

      case "escrow.funded": {
        await handleEscrowFunded(supabase, payload);
        break;
      }

      case "escrow.released": {
        await handleEscrowReleased(supabase, payload);
        break;
      }

      case "escrow.refunded": {
        await handleEscrowRefunded(supabase, payload);
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${payload.type}`);
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
  supabase: ReturnType<typeof createServiceClient>,
  payload: CoinPayWebhookPayload
) {
  const { data: paymentData } = payload;

  // Update payment status
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .update({
      status: "confirmed",
      amount_crypto: parseFloat(paymentData.amount_crypto),
      updated_at: new Date().toISOString(),
    })
    .eq("coinpay_payment_id", paymentData.payment_id)
    .select()
    .single();

  if (paymentError) {
    const handledInvoice = await handleGigInvoicePaymentConfirmed(supabase, payload);
    if (handledInvoice) return;
    console.error("Failed to update payment:", paymentError);
    return;
  }

  if (!payment) {
    const handledInvoice = await handleGigInvoicePaymentConfirmed(supabase, payload);
    if (handledInvoice) return;
    console.error("Payment not found:", paymentData.payment_id);
    return;
  }

  const amountUsd = Number(paymentData.amount_usd || 0);

  const paymentPlan =
    typeof payment.metadata === "object" && payment.metadata && "plan" in payment.metadata
      ? String((payment.metadata as Record<string, unknown>).plan || "")
      : "";

  // Handle based on payment type
  if (payment.type === "subscription") {
    if (paymentPlan === "lifetime") {
      await grantLifetimeForInvestment(supabase, payment.user_id, payment.id, amountUsd);
    } else {
      // Activate Pro subscription
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await supabase
        .from("subscriptions")
        .upsert({
          user_id: payment.user_id,
          coinpay_payment_id: paymentData.payment_id,
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
          amount_usd: paymentData.amount_usd,
          currency: paymentData.currency,
        },
      });
    }
  }

  // Investor perk: $50+ contribution via CoinPay grants lifetime plan
  if (payment.type !== "subscription" && amountUsd >= LIFETIME_THRESHOLD_USD) {
    await grantLifetimeForInvestment(supabase, payment.user_id, payment.id, amountUsd);
  }

  // Handle other payment types as needed
}

async function grantLifetimeForInvestment(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  paymentId: string,
  amountUsd: number
) {
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id, plan")
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing) {
    await supabase.from("subscriptions").insert({
      user_id: userId,
      status: "active",
      plan: "lifetime",
      current_period_start: now,
      cancel_at_period_end: false,
      updated_at: now,
    });
  } else if (existing.plan !== "lifetime") {
    await supabase
      .from("subscriptions")
      .update({
        status: "active",
        plan: "lifetime",
        cancel_at_period_end: false,
        updated_at: now,
      })
      .eq("id", existing.id);
  } else {
    return;
  }

  await supabase.from("notifications").insert({
    user_id: userId,
    type: "payment_received",
    title: "Lifetime unlocked 🎉",
    body: `Your $${amountUsd.toFixed(2)} investment unlocked free lifetime access.`,
    data: {
      payment_id: paymentId,
      reward: "lifetime",
      threshold_usd: LIFETIME_THRESHOLD_USD,
    },
  });
}

async function handlePaymentForwarded(
  supabase: ReturnType<typeof createServiceClient>,
  payload: CoinPayWebhookPayload
) {
  const { data: paymentData } = payload;

  // Update payment with forwarding info + crypto amount
  await (supabase
    .from("payments") as any)
    .update({
      status: "forwarded",
      amount_crypto: paymentData.amount_crypto || (paymentData as any).crypto_amount || null,
      metadata: {
        tx_hash: paymentData.tx_hash,
        merchant_tx_hash: paymentData.merchant_tx_hash,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("coinpay_payment_id", paymentData.payment_id);

  await updateGigInvoicePaymentMetadata(supabase, payload, "sent");
}

async function handlePaymentExpired(
  supabase: ReturnType<typeof createServiceClient>,
  payload: CoinPayWebhookPayload
) {
  const { data: paymentData } = payload;

  // Mark payment as expired
  const { data: payment } = await supabase
    .from("payments")
    .update({
      status: "expired",
      updated_at: new Date().toISOString(),
    })
    .eq("coinpay_payment_id", paymentData.payment_id)
    .select()
    .single();

  if (!payment) {
    const handledInvoice = await updateGigInvoicePaymentMetadata(supabase, payload, "expired");
    if (handledInvoice) return;
  }

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

async function handleGigInvoicePaymentConfirmed(
  supabase: ReturnType<typeof createServiceClient>,
  payload: CoinPayWebhookPayload
): Promise<boolean> {
  const { data: paymentData } = payload;
  const now = new Date().toISOString();
  const { data: existingInvoice } = await (supabase as any)
    .from("gig_invoices")
    .select("*")
    .eq("coinpay_invoice_id", paymentData.payment_id)
    .single();

  if (!existingInvoice) return false;

  const { data: invoice } = await (supabase as any)
    .from("gig_invoices")
    .update({
      status: "paid",
      updated_at: now,
      metadata: {
        ...((existingInvoice.metadata || {}) as Record<string, unknown>),
        tx_hash: paymentData.tx_hash,
        merchant_tx_hash: paymentData.merchant_tx_hash,
        paid_at: now,
        payment_currency: paymentData.currency,
        amount_crypto: paymentData.amount_crypto,
      },
    })
    .eq("id", existingInvoice.id)
    .select()
    .single();

  if (!invoice) return false;

  await supabase
    .from("applications")
    .update({
      status: "completed" as any,
      updated_at: now,
    })
    .eq("id", invoice.application_id);

  const { data: gig } = await supabase
    .from("gigs")
    .select("title")
    .eq("id", invoice.gig_id)
    .single();

  await supabase.from("notifications").insert([
    {
      user_id: invoice.worker_id,
      type: "payment_received",
      title: "Invoice paid",
      body: `$${invoice.amount_usd} invoice for "${gig?.title || "your gig"}" has been paid.`,
      data: {
        gig_id: invoice.gig_id,
        invoice_id: invoice.id,
      },
    },
    {
      user_id: invoice.poster_id,
      type: "payment_received",
      title: "Invoice paid",
      body: `Your $${invoice.amount_usd} invoice payment for "${gig?.title || "your gig"}" was confirmed.`,
      data: {
        gig_id: invoice.gig_id,
        invoice_id: invoice.id,
      },
    },
  ]);

  return true;
}

async function updateGigInvoicePaymentMetadata(
  supabase: ReturnType<typeof createServiceClient>,
  payload: CoinPayWebhookPayload,
  status: "sent" | "expired"
): Promise<boolean> {
  const { data: paymentData } = payload;
  const { data: existingInvoice } = await (supabase as any)
    .from("gig_invoices")
    .select("*")
    .eq("coinpay_invoice_id", paymentData.payment_id)
    .single();

  if (!existingInvoice) return false;

  const metadata: Record<string, unknown> = {
    ...((existingInvoice.metadata || {}) as Record<string, unknown>),
    tx_hash: paymentData.tx_hash,
    merchant_tx_hash: paymentData.merchant_tx_hash,
    payment_currency: paymentData.currency,
    amount_crypto: paymentData.amount_crypto,
  };
  if (status === "expired") metadata.expired_at = new Date().toISOString();

  const { data: invoice } = await (supabase as any)
    .from("gig_invoices")
    .update({
      status,
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existingInvoice.id)
    .select()
    .single();

  if (!invoice) return false;

  if (status === "expired") {
    await supabase.from("notifications").insert({
      user_id: invoice.worker_id,
      type: "payment_received",
      title: "Invoice payment expired",
      body: `The $${invoice.amount_usd} invoice payment request expired.`,
      data: {
        gig_id: invoice.gig_id,
        invoice_id: invoice.id,
      },
    });
  }

  return true;
}

// ─── Escrow webhook handlers ───────────────────────────────────────────────

async function handleEscrowFunded(
  supabase: ReturnType<typeof createServiceClient>,
  payload: CoinPayWebhookPayload
) {
  const escrowId = payload.data.metadata?.coinpay_escrow_id as string || payload.data.payment_id;
  const now = new Date().toISOString();

  // Find matching gig_escrow
  const { data: escrow } = await (supabase as any)
    .from("gig_escrows")
    .select("*")
    .eq("coinpay_escrow_id", escrowId)
    .single();

  if (!escrow) {
    console.error("Escrow not found for webhook:", escrowId);
    return;
  }

  // Update escrow status
  await (supabase as any)
    .from("gig_escrows")
    .update({
      status: "funded",
      funded_at: now,
      updated_at: now,
    })
    .eq("id", escrow.id);

  // Update application status to in_progress
  await supabase
    .from("applications")
    .update({
      status: "in_progress" as any,
      updated_at: now,
    })
    .eq("id", escrow.application_id);

  // Get gig title
  const { data: gig } = await supabase
    .from("gigs")
    .select("title")
    .eq("id", escrow.gig_id)
    .single();

  // Notify worker
  await supabase.from("notifications").insert({
    user_id: escrow.worker_id,
    type: "payment_received",
    title: "Escrow funded — work can begin!",
    body: `$${escrow.amount_usd} has been deposited in escrow for "${gig?.title || "your gig"}". You can start working now!`,
    data: {
      gig_id: escrow.gig_id,
      escrow_id: escrow.id,
    },
  });

  // Notify poster
  await supabase.from("notifications").insert({
    user_id: escrow.poster_id,
    type: "payment_received",
    title: "Escrow funded successfully",
    body: `Your $${escrow.amount_usd} escrow for "${gig?.title || "your gig"}" has been funded. The worker has been notified to begin.`,
    data: {
      gig_id: escrow.gig_id,
      escrow_id: escrow.id,
    },
  });
}

async function handleEscrowReleased(
  supabase: ReturnType<typeof createServiceClient>,
  payload: CoinPayWebhookPayload
) {
  const escrowId = payload.data.metadata?.coinpay_escrow_id as string || payload.data.payment_id;
  const now = new Date().toISOString();

  const { data: escrow } = await (supabase as any)
    .from("gig_escrows")
    .select("*")
    .eq("coinpay_escrow_id", escrowId)
    .single();

  if (!escrow) {
    console.error("Escrow not found for release webhook:", escrowId);
    return;
  }

  // Update if not already released (release route may have already updated)
  if (escrow.status !== "released") {
    await (supabase as any)
      .from("gig_escrows")
      .update({
        status: "released",
        released_at: now,
        updated_at: now,
      })
      .eq("id", escrow.id);

    await supabase
      .from("applications")
      .update({
        status: "completed" as any,
        updated_at: now,
      })
      .eq("id", escrow.application_id);
  }
}

async function handleEscrowRefunded(
  supabase: ReturnType<typeof createServiceClient>,
  payload: CoinPayWebhookPayload
) {
  const escrowId = payload.data.metadata?.coinpay_escrow_id as string || payload.data.payment_id;
  const now = new Date().toISOString();

  const { data: escrow } = await (supabase as any)
    .from("gig_escrows")
    .select("*")
    .eq("coinpay_escrow_id", escrowId)
    .single();

  if (!escrow) {
    console.error("Escrow not found for refund webhook:", escrowId);
    return;
  }

  await (supabase as any)
    .from("gig_escrows")
    .update({
      status: "refunded",
      updated_at: now,
    })
    .eq("id", escrow.id);

  // Notify poster
  await supabase.from("notifications").insert({
    user_id: escrow.poster_id,
    type: "payment_received",
    title: "Escrow refunded",
    body: `Your $${escrow.amount_usd} escrow has been refunded.`,
    data: {
      gig_id: escrow.gig_id,
      escrow_id: escrow.id,
    },
  });
}
