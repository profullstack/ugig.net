import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyWebhookSignature, type CoinPayWebhookPayload } from "@/lib/coinpayportal";
import { LIFETIME_THRESHOLD_USD } from "@/lib/funding";
import { getUserDid, onPaymentReceived, onPaymentSent } from "@/lib/reputation-hooks";
import { parseGitHubIssueUrl } from "@/lib/github-links";
import { updateIssueComment } from "@/lib/github-app";

const PAYABLE_GIG_INVOICE_STATUSES = new Set(["sent", "expired"]);

// POST /api/payments/coinpayportal/webhook - Handle CoinPayPortal webhooks
export async function POST(request: NextRequest) {
  return processCoinPayWebhook(request, [
    process.env.COINPAY_WEBHOOK_SECRET,
    process.env.COINPAY_FUNDING_WEBHOOK_SECRET,
  ]);
}

export async function processCoinPayWebhook(
  request: NextRequest,
  webhookSecret: string | Array<string | undefined> | undefined
) {
  try {
    const signature = request.headers.get("X-CoinPay-Signature");
    const rawBody = await request.text();
    const webhookSecrets = (Array.isArray(webhookSecret) ? webhookSecret : [webhookSecret]).filter(
      (secret): secret is string => Boolean(secret)
    );

    if (webhookSecrets.length === 0) {
      console.error("CoinPay webhook secret not configured");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
    }

    if (
      !signature ||
      !webhookSecrets.some((secret) => verifyWebhookSignature(rawBody, signature, secret))
    ) {
      console.error("Invalid webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
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
        if (await handleFundingPaymentEvent(supabase, payload, "confirmed")) break;
        await handlePaymentConfirmed(supabase, payload);
        break;
      }

      case "payment.forwarded": {
        if (await handleFundingPaymentEvent(supabase, payload, "forwarded")) break;
        await handlePaymentForwarded(supabase, payload);
        break;
      }

      case "payment.expired": {
        if (await handleFundingPaymentEvent(supabase, payload, "expired")) break;
        await handlePaymentExpired(supabase, payload);
        break;
      }

      case "payment.failed": {
        if (await handleFundingPaymentEvent(supabase, payload, "failed")) break;
        console.log(`Unhandled webhook event: ${payload.type}`);
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
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

async function handleFundingPaymentEvent(
  supabase: ReturnType<typeof createServiceClient>,
  payload: CoinPayWebhookPayload,
  status: "confirmed" | "forwarded" | "expired" | "failed"
): Promise<boolean> {
  const now = new Date().toISOString();
  const amountCrypto =
    typeof payload.data.amount_crypto === "string"
      ? parseFloat(payload.data.amount_crypto)
      : (payload.data.amount_crypto ?? null);
  const update: Record<string, unknown> = {
    status,
    updated_at: now,
    tx_hash: payload.data.tx_hash ?? null,
  };
  if (amountCrypto !== null) update.amount_crypto = amountCrypto;
  if (status === "confirmed" || status === "forwarded") update.paid_at = now;

  const { error } = await (supabase.from("funding_payments") as any)
    .update(update)
    .eq("coinpay_payment_id", payload.data.payment_id);

  if (error) {
    console.error("[coinpay webhook] funding update failed:", error);
    throw new Error("Funding payment update failed");
  }

  return payload.data.metadata?.type === "funding";
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
    const handledBounty = await handleBountyPaymentConfirmed(supabase, payload);
    if (handledBounty) return;
    console.error("Failed to update payment:", paymentError);
    return;
  }

  if (!payment) {
    const handledInvoice = await handleGigInvoicePaymentConfirmed(supabase, payload);
    if (handledInvoice) return;
    const handledBounty = await handleBountyPaymentConfirmed(supabase, payload);
    if (handledBounty) return;
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

      await supabase.from("subscriptions").upsert(
        {
          user_id: payment.user_id,
          coinpay_payment_id: paymentData.payment_id,
          status: "active",
          plan: "pro",
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          cancel_at_period_end: false,
          updated_at: now.toISOString(),
        },
        {
          onConflict: "user_id",
        }
      );

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

async function recordPaymentReputation(
  supabase: ReturnType<typeof createServiceClient>,
  {
    payerId,
    receiverId,
    paymentId,
    valueUsd,
    metadata,
  }: {
    payerId?: string | null;
    receiverId?: string | null;
    paymentId: string;
    valueUsd?: number;
    metadata?: Record<string, unknown>;
  }
) {
  try {
    const [payerDid, receiverDid] = await Promise.all([
      payerId ? getUserDid(supabase as any, payerId) : Promise.resolve(null),
      receiverId ? getUserDid(supabase as any, receiverId) : Promise.resolve(null),
    ]);

    await Promise.all([
      payerDid
        ? onPaymentSent(payerDid, paymentId, valueUsd, {
            ...metadata,
            counterparty_user_id: receiverId,
          })
        : Promise.resolve(false),
      receiverDid
        ? onPaymentReceived(receiverDid, paymentId, valueUsd, {
            ...metadata,
            counterparty_user_id: payerId,
          })
        : Promise.resolve(false),
    ]);
  } catch (err) {
    console.error("Payment reputation receipt failed (non-fatal):", err);
  }
}

async function handlePaymentForwarded(
  supabase: ReturnType<typeof createServiceClient>,
  payload: CoinPayWebhookPayload
) {
  const { data: paymentData } = payload;

  // Update payment with forwarding info + crypto amount
  await (supabase.from("payments") as any)
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

  // A forwarded payment means the recipient (the invoice's worker) actually
  // received their funds on-chain. Treat it as authoritative settlement for
  // gig invoices — record the merchant_tx_hash and mark paid if a confirmed
  // event hasn't already done so — instead of downgrading the invoice back to
  // "sent" (which previously reverted genuinely-paid invoices).
  if (await handleGigInvoicePaymentConfirmed(supabase, payload)) return;
  if (await handleBountyPaymentConfirmed(supabase, payload)) return;
  await updateBountyPaymentMetadata(supabase, payload, "invoiced");
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
    const handledBounty = await updateBountyPaymentMetadata(supabase, payload, "unpaid");
    if (handledBounty) return;
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

async function handleBountyPaymentConfirmed(
  supabase: ReturnType<typeof createServiceClient>,
  payload: CoinPayWebhookPayload
): Promise<boolean> {
  const { data: paymentData } = payload;
  const now = new Date().toISOString();
  const { data: existingSubmission } = await (supabase as any)
    .from("bounty_submissions")
    .select("*")
    .eq("coinpay_invoice_id", paymentData.payment_id)
    .single();

  if (!existingSubmission) return false;

  const existingSubMetadata = (existingSubmission.metadata || {}) as Record<string, unknown>;

  // Runs on both payment.confirmed and payment.forwarded — be idempotent. If the
  // payout is already settled, fold in any new forward proof (merchant_tx_hash
  // arrives with the forwarded event) and skip duplicate notifications/reputation.
  if (existingSubmission.payout_status === "paid") {
    await (supabase as any)
      .from("bounty_submissions")
      .update({
        updated_at: now,
        metadata: {
          ...existingSubMetadata,
          tx_hash: paymentData.tx_hash ?? existingSubMetadata.tx_hash ?? null,
          merchant_tx_hash:
            paymentData.merchant_tx_hash ?? existingSubMetadata.merchant_tx_hash ?? null,
          forwarded_at: paymentData.merchant_tx_hash ? now : existingSubMetadata.forwarded_at,
          payment_currency: paymentData.currency ?? existingSubMetadata.payment_currency,
          amount_crypto: paymentData.amount_crypto ?? existingSubMetadata.amount_crypto,
        },
      })
      .eq("id", existingSubmission.id);
    return true;
  }

  const { data: submission } = await (supabase as any)
    .from("bounty_submissions")
    .update({
      payout_status: "paid",
      paid_at: now,
      updated_at: now,
      metadata: {
        ...existingSubMetadata,
        tx_hash: paymentData.tx_hash,
        merchant_tx_hash: paymentData.merchant_tx_hash,
        paid_at: now,
        forwarded_at: paymentData.merchant_tx_hash ? now : undefined,
        payment_currency: paymentData.currency,
        amount_crypto: paymentData.amount_crypto,
      },
    })
    .eq("id", existingSubmission.id)
    .select()
    .single();

  if (!submission) return false;

  const { data: bounty } = await (supabase as any)
    .from("bounties")
    .select("id, title, creator_id, payout_usd, github_issue_url, github_comment_id")
    .eq("id", submission.bounty_id)
    .single();

  // Best-effort: flip the GitHub issue status comment to "paid". Only runs on
  // the first paid transition (the early-return above handles forwarded events),
  // so the comment is edited once.
  if (bounty?.github_issue_url && bounty.github_comment_id) {
    const coords = parseGitHubIssueUrl(bounty.github_issue_url);
    if (coords) {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net").replace(/\/$/, "");
      const body =
        `✅ **Bounty paid via [ugig.net](${appUrl})** — $${bounty.payout_usd} for "${bounty.title}".\n\n` +
        `<sub>Updated automatically by ugig.net.</sub>`;
      await updateIssueComment(coords.owner, coords.repo, bounty.github_comment_id, body);
    }
  }

  await (supabase.from("notifications") as any).insert(
    [
      {
        user_id: submission.submitter_id,
        type: "payment_received",
        title: "Bounty payout paid",
        body: `Your bounty payout for "${bounty?.title || "your submission"}" was confirmed.`,
        data: {
          bounty_id: submission.bounty_id,
          submission_id: submission.id,
        },
      },
      {
        user_id: bounty?.creator_id,
        type: "payment_received",
        title: "Bounty payout paid",
        body: `Your $${bounty?.payout_usd || paymentData.amount_usd || ""} bounty payout for "${bounty?.title || "a submission"}" was confirmed.`,
        data: {
          bounty_id: submission.bounty_id,
          submission_id: submission.id,
        },
      },
    ].filter((n) => n.user_id)
  );

  await recordPaymentReputation(supabase, {
    payerId: bounty?.creator_id,
    receiverId: submission.submitter_id,
    paymentId: paymentData.payment_id,
    valueUsd: Number(bounty?.payout_usd || paymentData.amount_usd || 0),
    metadata: {
      type: "bounty_payout",
      bounty_id: submission.bounty_id,
      submission_id: submission.id,
      payment_currency: paymentData.currency,
    },
  });

  return true;
}

async function updateBountyPaymentMetadata(
  supabase: ReturnType<typeof createServiceClient>,
  payload: CoinPayWebhookPayload,
  payoutStatus: "invoiced" | "unpaid"
): Promise<boolean> {
  const { data: paymentData } = payload;
  const { data: existingSubmission } = await (supabase as any)
    .from("bounty_submissions")
    .select("*")
    .eq("coinpay_invoice_id", paymentData.payment_id)
    .single();

  if (!existingSubmission) return false;

  const metadata: Record<string, unknown> = {
    ...((existingSubmission.metadata || {}) as Record<string, unknown>),
    tx_hash: paymentData.tx_hash,
    merchant_tx_hash: paymentData.merchant_tx_hash,
    payment_currency: paymentData.currency,
    amount_crypto: paymentData.amount_crypto,
  };
  const update: Record<string, unknown> = {
    payout_status: payoutStatus,
    metadata,
    updated_at: new Date().toISOString(),
  };

  if (payoutStatus === "unpaid") {
    metadata.expired_at = new Date().toISOString();
    metadata.expired_coinpay_invoice_id = existingSubmission.coinpay_invoice_id;
    update.coinpay_invoice_id = null;
    update.pay_url = null;
  }

  const { data: submission } = await (supabase as any)
    .from("bounty_submissions")
    .update(update)
    .eq("id", existingSubmission.id)
    .select()
    .single();

  if (!submission) return false;

  if (payoutStatus === "unpaid") {
    const { data: bounty } = await (supabase as any)
      .from("bounties")
      .select("title, creator_id")
      .eq("id", submission.bounty_id)
      .single();

    if (bounty?.creator_id) {
      await supabase.from("notifications").insert({
        user_id: bounty.creator_id,
        type: "payment_received",
        title: "Bounty payment expired",
        body: `The payment request for "${bounty.title || "your bounty"}" expired. You can create a new one.`,
        data: {
          bounty_id: submission.bounty_id,
          submission_id: submission.id,
        },
      });
    }
  }

  return true;
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

  const existingMetadata = (existingInvoice.metadata || {}) as Record<string, unknown>;

  // This handler runs on both payment.confirmed and payment.forwarded, so it
  // must be idempotent. If the invoice is already settled, just fold in any
  // new forward proof (the merchant_tx_hash arrives with the forwarded event)
  // and skip the one-time side-effects (application completion, notifications,
  // reputation) below.
  if (existingInvoice.status === "paid") {
    await (supabase as any)
      .from("gig_invoices")
      .update({
        updated_at: now,
        metadata: {
          ...existingMetadata,
          tx_hash: paymentData.tx_hash ?? existingMetadata.tx_hash ?? null,
          merchant_tx_hash:
            paymentData.merchant_tx_hash ?? existingMetadata.merchant_tx_hash ?? null,
          forwarded_at: paymentData.merchant_tx_hash ? now : existingMetadata.forwarded_at,
          payment_currency: paymentData.currency ?? existingMetadata.payment_currency,
          amount_crypto: paymentData.amount_crypto ?? existingMetadata.amount_crypto,
        },
      })
      .eq("id", existingInvoice.id);
    return true;
  }

  if (!PAYABLE_GIG_INVOICE_STATUSES.has(existingInvoice.status)) {
    return true;
  }

  const { data: invoice } = await (supabase as any)
    .from("gig_invoices")
    .update({
      status: "paid",
      updated_at: now,
      metadata: {
        ...existingMetadata,
        tx_hash: paymentData.tx_hash,
        merchant_tx_hash: paymentData.merchant_tx_hash,
        paid_at: now,
        forwarded_at: paymentData.merchant_tx_hash ? now : undefined,
        payment_currency: paymentData.currency,
        amount_crypto: paymentData.amount_crypto,
      },
    })
    .eq("id", existingInvoice.id)
    .in("status", Array.from(PAYABLE_GIG_INVOICE_STATUSES))
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

  await recordPaymentReputation(supabase, {
    payerId: invoice.poster_id,
    receiverId: invoice.worker_id,
    paymentId: paymentData.payment_id,
    valueUsd: Number(invoice.amount_usd || paymentData.amount_usd || 0),
    metadata: {
      type: "gig_invoice",
      gig_id: invoice.gig_id,
      application_id: invoice.application_id,
      invoice_id: invoice.id,
      payment_currency: paymentData.currency,
    },
  });

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

  if (!PAYABLE_GIG_INVOICE_STATUSES.has(existingInvoice.status)) {
    return true;
  }

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
    .in("status", Array.from(PAYABLE_GIG_INVOICE_STATUSES))
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
  const escrowId = (payload.data.metadata?.coinpay_escrow_id as string) || payload.data.payment_id;
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
  const escrowId = (payload.data.metadata?.coinpay_escrow_id as string) || payload.data.payment_id;
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
  const escrowId = (payload.data.metadata?.coinpay_escrow_id as string) || payload.data.payment_id;
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
