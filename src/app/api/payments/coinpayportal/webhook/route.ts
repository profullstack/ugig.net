import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyWebhookSignature, type CoinPayWebhookPayload } from "@/lib/coinpayportal";
import {
  handleFundingPaymentEvent,
  markCheckoutPaymentUnpaid,
  settleCheckoutPayment,
  type FundingEventStatus,
} from "@/lib/payments/checkout-settlement";
import { getUserDid, onPaymentReceived, onPaymentSent } from "@/lib/reputation-hooks";
import { parseGitHubIssueUrl } from "@/lib/github-links";
import { updateIssueComment } from "@/lib/github-app";

const PAYABLE_GIG_INVOICE_STATUSES = new Set(["sent", "expired"]);
const ESCROW_FUNDABLE_STATUSES = ["pending_payment"] as const;
const ESCROW_RELEASABLE_STATUSES = ["funded"] as const;
const ESCROW_REFUNDABLE_STATUSES = ["pending_payment", "funded", "disputed"] as const;

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
        if (await handleFunding(supabase, payload, "confirmed")) break;
        await handlePaymentSettled(supabase, payload, "confirmed");
        break;
      }

      case "payment.forwarded": {
        if (await handleFunding(supabase, payload, "forwarded")) break;
        await handlePaymentSettled(supabase, payload, "forwarded");
        break;
      }

      case "payment.expired": {
        if (await handleFunding(supabase, payload, "expired")) break;
        await handlePaymentExpired(supabase, payload);
        break;
      }

      case "payment.failed": {
        if (await handleFunding(supabase, payload, "failed")) break;
        await markCheckoutPaymentUnpaid(supabase, payload.data.payment_id, "failed");
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

function handleFunding(
  supabase: ReturnType<typeof createServiceClient>,
  payload: CoinPayWebhookPayload,
  status: FundingEventStatus
): Promise<boolean> {
  return handleFundingPaymentEvent(supabase, {
    coinpayPaymentId: payload.data.payment_id,
    status,
    amountUsd: payload.data.amount_usd,
    amountCrypto: payload.data.amount_crypto,
    txHash: payload.data.tx_hash ?? null,
    providerMetadata: payload.data.metadata ?? null,
  });
}

/**
 * payment.confirmed and payment.forwarded. Checkout payments (Pro, Lifetime,
 * tips) settle through the shared settlement code; anything else is a gig
 * invoice or bounty payout.
 */
async function handlePaymentSettled(
  supabase: ReturnType<typeof createServiceClient>,
  payload: CoinPayWebhookPayload,
  status: "confirmed" | "forwarded"
) {
  const { data: paymentData } = payload;

  const result = await settleCheckoutPayment(supabase, {
    coinpayPaymentId: paymentData.payment_id,
    status,
    amountUsd: paymentData.amount_usd,
    amountCrypto: paymentData.amount_crypto ?? (paymentData as any).crypto_amount,
    txHash: paymentData.tx_hash ?? null,
    merchantTxHash: paymentData.merchant_tx_hash ?? null,
    providerMetadata: paymentData.metadata ?? null,
  });
  if (result.found) return;

  // A confirmed or forwarded payment means the recipient (the invoice's worker)
  // received their funds. Both are authoritative settlement for gig invoices
  // and bounty payouts; the handlers are idempotent across the two events.
  if (await handleGigInvoicePaymentConfirmed(supabase, payload)) return;
  if (await handleBountyPaymentConfirmed(supabase, payload)) return;
  if (status === "forwarded") {
    await updateBountyPaymentMetadata(supabase, payload, "invoiced");
    return;
  }
  console.error("Payment not found:", paymentData.payment_id);
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

async function handlePaymentExpired(
  supabase: ReturnType<typeof createServiceClient>,
  payload: CoinPayWebhookPayload
) {
  const { data: paymentData } = payload;

  // Only a pending checkout payment expires; a settled one is left alone.
  const payment = await markCheckoutPaymentUnpaid(supabase, paymentData.payment_id, "expired");

  if (payment) {
    await supabase.from("notifications").insert({
      user_id: payment.user_id,
      type: "payment_received",
      title: "Payment expired",
      body: "Your payment request has expired. Please try again.",
      data: {
        payment_id: payment.id,
      },
    });
    return;
  }

  const { data: existing } = await supabase
    .from("payments")
    .select("id")
    .eq("coinpay_payment_id", paymentData.payment_id)
    .maybeSingle();
  if (existing) return;

  const handledInvoice = await updateGigInvoicePaymentMetadata(supabase, payload, "expired");
  if (handledInvoice) return;
  await updateBountyPaymentMetadata(supabase, payload, "unpaid");
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

async function transitionEscrowStatus(
  supabase: ReturnType<typeof createServiceClient>,
  escrowId: string,
  allowedStatuses: readonly string[],
  update: Record<string, unknown>
): Promise<boolean> {
  let query = (supabase as any)
    .from("gig_escrows")
    .update(update)
    .eq("id", escrowId);

  query =
    allowedStatuses.length === 1
      ? query.eq("status", allowedStatuses[0])
      : query.in("status", Array.from(allowedStatuses));

  const { data, error } = await query.select("id").single();

  if (error || !data) {
    return false;
  }

  return true;
}

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

  if (!ESCROW_FUNDABLE_STATUSES.includes(escrow.status as any)) return;

  const transitioned = await transitionEscrowStatus(
    supabase,
    escrow.id,
    ESCROW_FUNDABLE_STATUSES,
    {
      status: "funded",
      funded_at: now,
      updated_at: now,
    }
  );
  if (!transitioned) return;

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

  // Release route may have already updated this record before the webhook arrives.
  if (escrow.status === "released") return;
  if (!ESCROW_RELEASABLE_STATUSES.includes(escrow.status as any)) return;

  const transitioned = await transitionEscrowStatus(
    supabase,
    escrow.id,
    ESCROW_RELEASABLE_STATUSES,
    {
      status: "released",
      released_at: now,
      updated_at: now,
    }
  );
  if (!transitioned) return;

  await supabase
    .from("applications")
    .update({
      status: "completed" as any,
      updated_at: now,
    })
    .eq("id", escrow.application_id);
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

  if (!ESCROW_REFUNDABLE_STATUSES.includes(escrow.status as any)) return;

  const transitioned = await transitionEscrowStatus(
    supabase,
    escrow.id,
    ESCROW_REFUNDABLE_STATUSES,
    {
      status: "refunded",
      updated_at: now,
    }
  );
  if (!transitioned) return;

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
