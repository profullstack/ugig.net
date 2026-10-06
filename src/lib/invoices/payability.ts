import type { CoinpayLinkState } from "@/lib/coinpay-oauth";

/**
 * Why an open invoice cannot be paid right now, or null when it can.
 *
 * A gig invoice is created without a CoinPay id on purpose: the payment
 * request (and its id) is minted when the poster presses Pay, because a quote
 * is only good for 15 minutes. What the payer needs from the row itself is
 * the worker's receiving wallet. What they need from the worker is a CoinPay
 * link that still works, which the payment-request route now checks.
 *
 * - "missing_wallet": no receiving wallet on the row. Nothing the poster can do
 *   except ask for a new invoice.
 * - "worker_reconnect": the worker's CoinPay link is gone or unusable. The
 *   worker reconnects at /settings/connections; the poster can ask for a new
 *   invoice, which the create gate will hold until they do.
 */
export type UnpayableReason = "missing_wallet" | "worker_reconnect";

const OPEN_STATUSES = new Set(["sent", "expired"]);

export function invoiceUnpayableReason(
  invoice: { status: string; metadata: Record<string, unknown> | null | undefined },
  workerLinkState: CoinpayLinkState | null | undefined
): UnpayableReason | null {
  if (!OPEN_STATUSES.has(invoice.status)) return null;
  const meta = invoice.metadata ?? {};
  const address =
    typeof meta.merchant_wallet_address === "string" ? meta.merchant_wallet_address.trim() : "";
  const currency =
    typeof meta.receiver_payment_currency === "string"
      ? meta.receiver_payment_currency
      : typeof meta.payment_currency === "string"
        ? meta.payment_currency
        : "";
  if (!address || !currency) return "missing_wallet";
  // A live quote already minted can still be paid even if the link has since
  // lapsed; only a fresh request needs the worker's link.
  const hasLiveQuote =
    typeof meta.payment_address === "string" &&
    typeof meta.expires_at === "string" &&
    Date.parse(meta.expires_at) > Date.now();
  if (!hasLiveQuote && workerLinkState && workerLinkState !== "connected") {
    return "worker_reconnect";
  }
  return null;
}

export const UNPAYABLE_LABEL: Record<UnpayableReason, string> = {
  missing_wallet: "Can't be paid: no receiving wallet",
  worker_reconnect: "Can't be paid: worker must reconnect CoinPay",
};
