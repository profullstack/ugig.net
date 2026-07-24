import { createPayment, preferredCoinToPaymentCurrency } from "@/lib/coinpayportal";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Creating the CoinPay payment request for an invoice.
 *
 * Extracted from the single-invoice `payment-request` route so the bulk payer
 * can produce byte-identical requests: one code path decides the currency, the
 * receiving address, the crypto amount, and what gets written to metadata.
 * Two implementations here would eventually disagree about what "paid" means.
 */

export const PAYMENT_REQUEST_SECONDS = 15 * 60;

export const PAYABLE_INVOICE_STATUSES = new Set(["sent", "expired"]);

export interface InvoicePaymentRequestData {
  invoice_id: string;
  coinpay_invoice_id: string;
  pay_url: string | null;
  payment_address: string;
  amount_crypto: string | number | null;
  payment_currency: string;
  expires_at: string;
  metadata: Record<string, unknown>;
}

export type PaymentRequestResult =
  | { ok: true; data: InvoicePaymentRequestData; reused: boolean }
  | { ok: false; error: string; code: "NO_WALLET" | "PROVIDER" | "PERSIST" };

export function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * An existing request is still usable only while its quote holds. CoinPay locks
 * the crypto amount at the market rate when the request is made, so past
 * `expires_at` we must re-quote rather than send a stale amount.
 */
export function activeExpiresAt(metadata: Record<string, unknown>): Date | null {
  const expiresAt = typeof metadata.expires_at === "string" ? metadata.expires_at : null;
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime()) || date <= new Date()) return null;
  return date;
}

/** The worker's receiving wallet, as captured on the invoice. */
function receivingWallet(metadata: Record<string, unknown>): {
  currency: string | null;
  address: string;
  label: string | null;
} {
  const currency = preferredCoinToPaymentCurrency(
    typeof metadata.receiver_payment_currency === "string"
      ? metadata.receiver_payment_currency
      : typeof metadata.payment_currency === "string" && !metadata.payment_address
        ? metadata.payment_currency
        : null
  );
  const address =
    typeof metadata.merchant_wallet_address === "string"
      ? metadata.merchant_wallet_address.trim()
      : "";
  const label =
    typeof metadata.merchant_wallet_label === "string" ? metadata.merchant_wallet_label : null;

  return { currency, address, label };
}

/**
 * Return a live payment request for this invoice, reusing an unexpired one when
 * possible and otherwise creating a fresh quote.
 *
 * Reuse matters for bulk: a run that partially fails gets retried, and without
 * reuse the retry would mint a second payment request per invoice — leaving
 * two live addresses for one debt.
 *
 * The caller must already have verified that the invoice belongs to the payer
 * and is in a payable state.
 */
export async function ensureInvoicePaymentRequest(
  invoice: any,
  options: { appUrl?: string; businessId?: string } = {}
): Promise<PaymentRequestResult> {
  const metadata = metadataObject(invoice.metadata);

  if (invoice.coinpay_invoice_id && metadata.payment_address && activeExpiresAt(metadata)) {
    return {
      ok: true,
      reused: true,
      data: {
        invoice_id: invoice.id,
        coinpay_invoice_id: invoice.coinpay_invoice_id,
        pay_url: invoice.pay_url || null,
        payment_address: String(metadata.payment_address),
        amount_crypto: (metadata.amount_crypto as string | number | null) ?? null,
        payment_currency: String(metadata.payment_currency || ""),
        expires_at: String(metadata.expires_at || ""),
        metadata,
      },
    };
  }

  const gig = Array.isArray(invoice.gig) ? invoice.gig[0] : invoice.gig;
  const appUrl =
    options.appUrl || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";
  const businessId = options.businessId || process.env.COINPAY_MERCHANT_ID;

  const wallet = receivingWallet(metadata);
  if (!wallet.currency || !wallet.address) {
    return {
      ok: false,
      code: "NO_WALLET",
      error: "This invoice is missing the worker's CoinPay receiving wallet",
    };
  }

  let paymentResult: any;
  try {
    paymentResult = await createPayment({
      amount_usd: Number(invoice.amount_usd),
      currency: wallet.currency as any,
      description: invoice.notes || `Invoice for gig: ${gig?.title || invoice.gig_id}`,
      business_id: businessId,
      merchant_wallet_address: wallet.address,
      redirect_url: `${appUrl}/dashboard/invoices?tab=received`,
      expires_in: PAYMENT_REQUEST_SECONDS,
      metadata: {
        type: "gig_invoice",
        gig_id: invoice.gig_id,
        invoice_id: invoice.id,
        application_id: invoice.application_id,
        worker_id: invoice.worker_id,
        poster_id: invoice.poster_id,
        invoice_currency: invoice.currency,
        payment_currency: wallet.currency,
        merchant_wallet_address: wallet.address,
        merchant_wallet_label: wallet.label,
        platform: "ugig.net",
      },
    });
  } catch (err) {
    return {
      ok: false,
      code: "PROVIDER",
      error: err instanceof Error ? err.message : "Failed to create payment request",
    };
  }

  const cpPayment = paymentResult.payment || paymentResult;
  const paymentId = paymentResult.payment_id || cpPayment.id;
  const paymentAddress = cpPayment.payment_address || paymentResult.address || null;
  const checkoutUrl = paymentResult.checkout_url || cpPayment.checkout_url || null;
  const amountCrypto =
    paymentResult.amount_crypto || cpPayment.amount_crypto || cpPayment.crypto_amount || null;
  const expiresAt =
    paymentResult.expires_at ||
    cpPayment.expires_at ||
    new Date(Date.now() + PAYMENT_REQUEST_SECONDS * 1000).toISOString();
  const responseCurrency = paymentResult.currency || cpPayment.currency || wallet.currency;

  if (!paymentId) {
    return { ok: false, code: "PROVIDER", error: "CoinPay did not return a payment id" };
  }
  if (!paymentAddress) {
    return {
      ok: false,
      code: "PROVIDER",
      error: "CoinPay did not return an in-app payment address",
    };
  }

  const previousPaymentIds = Array.isArray(metadata.previous_coinpay_invoice_ids)
    ? metadata.previous_coinpay_invoice_ids
    : [];
  const nextMetadata = {
    ...metadata,
    previous_coinpay_invoice_ids: invoice.coinpay_invoice_id
      ? [...previousPaymentIds, invoice.coinpay_invoice_id]
      : previousPaymentIds,
    payment_address: paymentAddress,
    amount_crypto: amountCrypto,
    payment_currency: responseCurrency,
    receiver_payment_currency: wallet.currency,
    merchant_wallet_address: wallet.address,
    merchant_wallet_label: wallet.label,
    checkout_url: checkoutUrl,
    expires_at: expiresAt,
    payment_request_created_at: new Date().toISOString(),
    coinpay_status: "pending",
  };

  const serviceSupabase = createServiceClient();
  const { data: updated, error: updateError } = await (
    (serviceSupabase as any).from("gig_invoices") as any
  )
    .update({
      status: "sent",
      coinpay_invoice_id: paymentId,
      pay_url: null,
      metadata: nextMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoice.id)
    .select()
    .single();

  if (updateError) {
    console.error("[invoice payment request] update failed:", updateError);
    return { ok: false, code: "PERSIST", error: "Failed to save payment request" };
  }

  return {
    ok: true,
    reused: false,
    data: {
      invoice_id: updated.id,
      coinpay_invoice_id: paymentId,
      pay_url: null,
      payment_address: paymentAddress,
      amount_crypto: amountCrypto,
      payment_currency: responseCurrency,
      expires_at: expiresAt,
      metadata: updated.metadata,
    },
  };
}
