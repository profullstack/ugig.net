/**
 * LNbits API client for funding invoice creation and payment verification.
 */

const LNBITS_URL = process.env.LNBITS_URL;
const LNBITS_INVOICE_KEY = process.env.LNBITS_INVOICE_KEY;
const LNBITS_ADMIN_KEY = process.env.LNBITS_ADMIN_KEY;

export type LNbitsInvoiceResponse = {
  payment_hash: string;
  payment_request: string;
  checking_id: string;
  lnurl_response: string | null;
};

export type LNbitsPaymentStatus = {
  paid: boolean;
  preimage: string | null;
  details: {
    checking_id: string;
    pending: boolean;
    amount: number;
    fee: number;
    memo: string;
    time: number;
    bolt11: string;
    preimage: string;
    payment_hash: string;
    expiry: number;
    extra: Record<string, unknown>;
    wallet_id: string;
    webhook: string | null;
    webhook_status: number | null;
  } | null;
};

function getConfig() {
  if (!LNBITS_URL) throw new Error("LNBITS_URL not configured");
  if (!LNBITS_INVOICE_KEY) throw new Error("LNBITS_INVOICE_KEY not configured");
  return { url: LNBITS_URL.replace(/\/$/, ""), invoiceKey: LNBITS_INVOICE_KEY, adminKey: LNBITS_ADMIN_KEY };
}

/**
 * Create a Lightning invoice via LNbits.
 */
export async function createInvoice(params: {
  amount: number; // sats
  memo: string;
  expiry?: number; // seconds, default 600 (10 min)
  webhook?: string;
}): Promise<LNbitsInvoiceResponse> {
  const { url, invoiceKey } = getConfig();
  const expiry = params.expiry ?? 600;

  const res = await fetch(`${url}/api/v1/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": invoiceKey,
    },
    body: JSON.stringify({
      out: false,
      amount: params.amount,
      memo: params.memo,
      expiry,
      webhook: params.webhook,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LNbits create invoice failed (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * Check payment status via LNbits.
 */
export async function checkPayment(paymentHash: string): Promise<LNbitsPaymentStatus> {
  const { url, invoiceKey } = getConfig();

  const res = await fetch(`${url}/api/v1/payments/${paymentHash}`, {
    headers: {
      "X-Api-Key": invoiceKey,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LNbits check payment failed (${res.status}): ${text}`);
  }

  return res.json();
}
