import type { SupabaseClient } from "@supabase/supabase-js";
import { getPaymentStatus } from "@/lib/coinpayportal";
import { getUserDid, onPaymentReceived, onPaymentSent } from "@/lib/reputation-hooks";

type Db = SupabaseClient<any>;

type SyncStatus = "pending" | "confirmed" | "forwarded" | "expired" | "failed";

interface CoinpayStatusPayment {
  id: string;
  status: string;
  tx_hash?: string | null;
  forward_tx_hash?: string | null;
  merchant_tx_hash?: string | null;
  confirmed_at?: string | null;
  blockchain?: string;
  crypto_currency?: string;
  currency?: string;
  crypto_amount?: string | number | null;
  amount_crypto?: string | number | null;
  amount_usd?: string | number | null;
  payment_address?: string;
}

interface SyncResult {
  id: string;
  coinpay_payment_id: string | null;
  kind: "bounty" | "gig_invoice";
  local_status: string;
  upstream_status?: string;
  changed: boolean;
  error?: string;
}

const PAYOUT_PENDING_STATUSES = new Set(["pending", "processing", "detected"]);
const PAYOUT_PAID_STATUSES = new Set(["confirmed", "forwarded"]);
const PAYOUT_FAILED_STATUSES = new Set(["expired", "failed"]);
const PAYABLE_GIG_INVOICE_STATUSES = new Set(["sent", "expired"]);

function normalizeStatus(status?: string | null): SyncStatus | string {
  return (status || "pending").toLowerCase();
}

function amountNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function cryptoAmount(payment: CoinpayStatusPayment): string | number | null {
  return payment.amount_crypto ?? payment.crypto_amount ?? null;
}

function paymentCurrency(
  payment: CoinpayStatusPayment,
  existingMetadata: Record<string, unknown>
): string | null {
  return (
    payment.currency ||
    payment.blockchain ||
    (typeof existingMetadata.payment_currency === "string"
      ? existingMetadata.payment_currency
      : null)
  );
}

/**
 * The chain the payment settled on, kept separate from `payment_currency`.
 *
 * CoinPay reports the invoice currency in `currency` — usually "USD" — so
 * `payment_currency` names no chain and cannot resolve a block explorer. The
 * chain lives in `blockchain` (with `crypto_currency` as a fallback), and the
 * receipt UI needs it to build a transaction link.
 */
function settlementChain(
  payment: CoinpayStatusPayment,
  existingMetadata: Record<string, unknown>
): string | null {
  return (
    payment.blockchain ||
    payment.crypto_currency ||
    (typeof existingMetadata.settlement_chain === "string"
      ? existingMetadata.settlement_chain
      : null)
  );
}

async function recordPaymentReputation(
  supabase: Db,
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
      payerId ? getUserDid(supabase, payerId) : Promise.resolve(null),
      receiverId ? getUserDid(supabase, receiverId) : Promise.resolve(null),
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
    console.error("[coinpay sync] payment reputation receipt failed:", err);
  }
}

export async function syncBountyPaymentStatus(
  supabase: Db,
  coinpayPaymentId: string
): Promise<SyncResult> {
  const { data: existingSubmission, error } = await (supabase.from("bounty_submissions") as any)
    .select("*")
    .eq("coinpay_invoice_id", coinpayPaymentId)
    .maybeSingle();

  if (error) {
    return {
      id: coinpayPaymentId,
      coinpay_payment_id: coinpayPaymentId,
      kind: "bounty",
      local_status: "unknown",
      changed: false,
      error: error.message,
    };
  }

  if (!existingSubmission) {
    return {
      id: coinpayPaymentId,
      coinpay_payment_id: coinpayPaymentId,
      kind: "bounty",
      local_status: "not_found",
      changed: false,
    };
  }

  if (existingSubmission.payout_status === "paid") {
    return {
      id: existingSubmission.id,
      coinpay_payment_id: coinpayPaymentId,
      kind: "bounty",
      local_status: "paid",
      changed: false,
    };
  }

  const cp = await getPaymentStatus(coinpayPaymentId);
  const payment = (cp.payment || {}) as CoinpayStatusPayment;
  const upstreamStatus = normalizeStatus(payment.status);
  const existingMetadata = (existingSubmission.metadata || {}) as Record<string, unknown>;
  const now = new Date().toISOString();

  if (PAYOUT_PAID_STATUSES.has(upstreamStatus)) {
    const metadata = {
      ...existingMetadata,
      coinpay_status: upstreamStatus,
      tx_hash: payment.tx_hash ?? existingMetadata.tx_hash ?? null,
      merchant_tx_hash:
        payment.merchant_tx_hash ?? payment.forward_tx_hash ?? existingMetadata.merchant_tx_hash ?? null,
      paid_at: now,
      payment_currency: paymentCurrency(payment, existingMetadata),
      settlement_chain: settlementChain(payment, existingMetadata),
      amount_crypto: cryptoAmount(payment) ?? existingMetadata.amount_crypto ?? null,
    };

    const { data: submission, error: updateError } = await (supabase.from("bounty_submissions") as any)
      .update({
        payout_status: "paid",
        paid_at: now,
        updated_at: now,
        metadata,
      })
      .eq("id", existingSubmission.id)
      .neq("payout_status", "paid")
      .select()
      .maybeSingle();

    if (updateError) throw updateError;
    if (!submission) {
      return {
        id: existingSubmission.id,
        coinpay_payment_id: coinpayPaymentId,
        kind: "bounty",
        local_status: existingSubmission.payout_status,
        upstream_status: upstreamStatus,
        changed: false,
      };
    }

    const { data: bounty } = await (supabase.from("bounties") as any)
      .select("id, title, creator_id, payout_usd")
      .eq("id", submission.bounty_id)
      .maybeSingle();

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
          body: `Your $${bounty?.payout_usd || payment.amount_usd || ""} bounty payout for "${bounty?.title || "a submission"}" was confirmed.`,
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
      paymentId: coinpayPaymentId,
      valueUsd: amountNumber(bounty?.payout_usd || payment.amount_usd),
      metadata: {
        type: "bounty_payout",
        bounty_id: submission.bounty_id,
        submission_id: submission.id,
        payment_currency: metadata.payment_currency,
        source: "coinpay_status_sync",
      },
    });

    return {
      id: submission.id,
      coinpay_payment_id: coinpayPaymentId,
      kind: "bounty",
      local_status: "paid",
      upstream_status: upstreamStatus,
      changed: true,
    };
  }

  if (PAYOUT_FAILED_STATUSES.has(upstreamStatus)) {
    const metadata = {
      ...existingMetadata,
      coinpay_status: upstreamStatus,
      tx_hash: payment.tx_hash ?? existingMetadata.tx_hash ?? null,
      merchant_tx_hash:
        payment.merchant_tx_hash ?? payment.forward_tx_hash ?? existingMetadata.merchant_tx_hash ?? null,
      payment_currency: paymentCurrency(payment, existingMetadata),
      settlement_chain: settlementChain(payment, existingMetadata),
      amount_crypto: cryptoAmount(payment) ?? existingMetadata.amount_crypto ?? null,
      expired_at: upstreamStatus === "expired" ? now : existingMetadata.expired_at,
      failed_at: upstreamStatus === "failed" ? now : existingMetadata.failed_at,
      expired_coinpay_invoice_id:
        upstreamStatus === "expired" ? coinpayPaymentId : existingMetadata.expired_coinpay_invoice_id,
      failed_coinpay_invoice_id:
        upstreamStatus === "failed" ? coinpayPaymentId : existingMetadata.failed_coinpay_invoice_id,
    };

    const { data: submission, error: updateError } = await (supabase.from("bounty_submissions") as any)
      .update({
        payout_status: "unpaid",
        coinpay_invoice_id: null,
        pay_url: null,
        metadata,
        updated_at: now,
      })
      .eq("id", existingSubmission.id)
      .eq("payout_status", "invoiced")
      .select()
      .maybeSingle();

    if (updateError) throw updateError;

    if (submission) {
      const { data: bounty } = await (supabase.from("bounties") as any)
        .select("title, creator_id")
        .eq("id", submission.bounty_id)
        .maybeSingle();

      if (bounty?.creator_id) {
        await (supabase.from("notifications") as any).insert({
          user_id: bounty.creator_id,
          type: "payment_received",
          title: upstreamStatus === "expired" ? "Bounty payment expired" : "Bounty payment failed",
          body:
            upstreamStatus === "expired"
              ? `The payment request for "${bounty.title || "your bounty"}" expired. You can create a new one.`
              : `The payment request for "${bounty.title || "your bounty"}" failed. You can create a new one.`,
          data: {
            bounty_id: submission.bounty_id,
            submission_id: submission.id,
          },
        });
      }
    }

    return {
      id: existingSubmission.id,
      coinpay_payment_id: coinpayPaymentId,
      kind: "bounty",
      local_status: "unpaid",
      upstream_status: upstreamStatus,
      changed: Boolean(submission),
    };
  }

  if (PAYOUT_PENDING_STATUSES.has(upstreamStatus)) {
    await (supabase.from("bounty_submissions") as any)
      .update({
        metadata: {
          ...existingMetadata,
          coinpay_status: upstreamStatus,
          tx_hash: payment.tx_hash ?? existingMetadata.tx_hash ?? null,
        },
        updated_at: now,
      })
      .eq("id", existingSubmission.id);
  }

  return {
    id: existingSubmission.id,
    coinpay_payment_id: coinpayPaymentId,
    kind: "bounty",
    local_status: existingSubmission.payout_status,
    upstream_status: upstreamStatus,
    changed: false,
  };
}

export async function syncGigInvoicePaymentStatus(
  supabase: Db,
  coinpayPaymentId: string
): Promise<SyncResult> {
  const { data: existingInvoice, error } = await (supabase.from("gig_invoices") as any)
    .select("*")
    .eq("coinpay_invoice_id", coinpayPaymentId)
    .maybeSingle();

  if (error) {
    return {
      id: coinpayPaymentId,
      coinpay_payment_id: coinpayPaymentId,
      kind: "gig_invoice",
      local_status: "unknown",
      changed: false,
      error: error.message,
    };
  }

  if (!existingInvoice) {
    return {
      id: coinpayPaymentId,
      coinpay_payment_id: coinpayPaymentId,
      kind: "gig_invoice",
      local_status: "not_found",
      changed: false,
    };
  }

  if (existingInvoice.status === "paid") {
    return {
      id: existingInvoice.id,
      coinpay_payment_id: coinpayPaymentId,
      kind: "gig_invoice",
      local_status: "paid",
      changed: false,
    };
  }

  const cp = await getPaymentStatus(coinpayPaymentId);
  const payment = (cp.payment || {}) as CoinpayStatusPayment;
  const upstreamStatus = normalizeStatus(payment.status);
  const existingMetadata = (existingInvoice.metadata || {}) as Record<string, unknown>;
  const now = new Date().toISOString();

  if (PAYOUT_PAID_STATUSES.has(upstreamStatus)) {
    if (!PAYABLE_GIG_INVOICE_STATUSES.has(existingInvoice.status)) {
      return {
        id: existingInvoice.id,
        coinpay_payment_id: coinpayPaymentId,
        kind: "gig_invoice",
        local_status: existingInvoice.status,
        upstream_status: upstreamStatus,
        changed: false,
      };
    }

    const metadata = {
      ...existingMetadata,
      coinpay_status: upstreamStatus,
      tx_hash: payment.tx_hash ?? existingMetadata.tx_hash ?? null,
      merchant_tx_hash:
        payment.merchant_tx_hash ?? payment.forward_tx_hash ?? existingMetadata.merchant_tx_hash ?? null,
      paid_at: now,
      payment_currency: paymentCurrency(payment, existingMetadata),
      settlement_chain: settlementChain(payment, existingMetadata),
      amount_crypto: cryptoAmount(payment) ?? existingMetadata.amount_crypto ?? null,
    };

    const { data: invoice, error: updateError } = await (supabase.from("gig_invoices") as any)
      .update({
        status: "paid",
        metadata,
        updated_at: now,
      })
      .eq("id", existingInvoice.id)
      .in("status", Array.from(PAYABLE_GIG_INVOICE_STATUSES))
      .select()
      .maybeSingle();

    if (updateError) throw updateError;
    if (!invoice) {
      return {
        id: existingInvoice.id,
        coinpay_payment_id: coinpayPaymentId,
        kind: "gig_invoice",
        local_status: existingInvoice.status,
        upstream_status: upstreamStatus,
        changed: false,
      };
    }

    await (supabase.from("applications") as any)
      .update({
        status: "completed",
        updated_at: now,
      })
      .eq("id", invoice.application_id);

    const { data: gig } = await (supabase.from("gigs") as any)
      .select("title")
      .eq("id", invoice.gig_id)
      .maybeSingle();

    await (supabase.from("notifications") as any).insert([
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
      paymentId: coinpayPaymentId,
      valueUsd: amountNumber(invoice.amount_usd || payment.amount_usd),
      metadata: {
        type: "gig_invoice",
        gig_id: invoice.gig_id,
        application_id: invoice.application_id,
        invoice_id: invoice.id,
        payment_currency: metadata.payment_currency,
        source: "coinpay_status_sync",
      },
    });

    return {
      id: invoice.id,
      coinpay_payment_id: coinpayPaymentId,
      kind: "gig_invoice",
      local_status: "paid",
      upstream_status: upstreamStatus,
      changed: true,
    };
  }

  if (PAYOUT_FAILED_STATUSES.has(upstreamStatus)) {
    const previousPaymentIds = Array.isArray(existingMetadata.previous_coinpay_invoice_ids)
      ? existingMetadata.previous_coinpay_invoice_ids
      : [];
    const metadata = {
      ...existingMetadata,
      coinpay_status: upstreamStatus,
      tx_hash: payment.tx_hash ?? existingMetadata.tx_hash ?? null,
      merchant_tx_hash:
        payment.merchant_tx_hash ?? payment.forward_tx_hash ?? existingMetadata.merchant_tx_hash ?? null,
      payment_currency: paymentCurrency(payment, existingMetadata),
      settlement_chain: settlementChain(payment, existingMetadata),
      amount_crypto: cryptoAmount(payment) ?? existingMetadata.amount_crypto ?? null,
      expired_at: upstreamStatus === "expired" ? now : existingMetadata.expired_at,
      failed_at: upstreamStatus === "failed" ? now : existingMetadata.failed_at,
      previous_coinpay_invoice_ids: [...previousPaymentIds, coinpayPaymentId],
      expired_coinpay_invoice_id:
        upstreamStatus === "expired" ? coinpayPaymentId : existingMetadata.expired_coinpay_invoice_id,
      failed_coinpay_invoice_id:
        upstreamStatus === "failed" ? coinpayPaymentId : existingMetadata.failed_coinpay_invoice_id,
      payment_address: null,
      checkout_url: null,
      expires_at: null,
    };

    const { data: invoice, error: updateError } = await (supabase.from("gig_invoices") as any)
      .update({
        status: "sent",
        coinpay_invoice_id: null,
        pay_url: null,
        metadata,
        updated_at: now,
      })
      .eq("id", existingInvoice.id)
      .eq("coinpay_invoice_id", coinpayPaymentId)
      .eq("status", "sent")
      .select()
      .maybeSingle();

    if (updateError) throw updateError;

    if (invoice) {
      await (supabase.from("notifications") as any).insert({
        user_id: invoice.worker_id,
        type: "payment_received",
        title:
          upstreamStatus === "expired"
            ? "Invoice payment request expired"
            : "Invoice payment request failed",
        body:
          upstreamStatus === "expired"
            ? `The $${invoice.amount_usd} invoice is still open. The client can generate a fresh payment request when ready to pay.`
            : `The $${invoice.amount_usd} invoice payment request failed. The client can generate a fresh payment request when ready to pay.`,
        data: {
          gig_id: invoice.gig_id,
          invoice_id: invoice.id,
        },
      });
    }

    return {
      id: existingInvoice.id,
      coinpay_payment_id: coinpayPaymentId,
      kind: "gig_invoice",
      local_status: existingInvoice.status,
      upstream_status: upstreamStatus,
      changed: Boolean(invoice),
    };
  }

  if (!PAYABLE_GIG_INVOICE_STATUSES.has(existingInvoice.status)) {
    return {
      id: existingInvoice.id,
      coinpay_payment_id: coinpayPaymentId,
      kind: "gig_invoice",
      local_status: existingInvoice.status,
      upstream_status: upstreamStatus,
      changed: false,
    };
  }

  if (PAYOUT_PENDING_STATUSES.has(upstreamStatus)) {
    await (supabase.from("gig_invoices") as any)
      .update({
        metadata: {
          ...existingMetadata,
          coinpay_status: upstreamStatus,
          tx_hash: payment.tx_hash ?? existingMetadata.tx_hash ?? null,
        },
        updated_at: now,
      })
      .eq("id", existingInvoice.id);
  }

  return {
    id: existingInvoice.id,
    coinpay_payment_id: coinpayPaymentId,
    kind: "gig_invoice",
    local_status: existingInvoice.status,
    upstream_status: upstreamStatus,
    changed: false,
  };
}
