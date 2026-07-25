import { explorerChain, explorerName, explorerTxUrl } from "@/lib/explorer";

/**
 * The on-chain receipt for a paid invoice.
 *
 * A settled invoice can involve two distinct transactions, and both parties
 * need to be able to look either one up:
 *
 *  - `payment` — the payer's funds landing on the CoinPay deposit address
 *    (`tx_hash`). This is what proves the client paid.
 *  - `payout`  — CoinPay forwarding those funds on to the worker's own wallet
 *    (`merchant_tx_hash`). This is what proves the worker was paid.
 *
 * A third case, `broadcast`, covers invoices paid straight from the payer's
 * wallet extension: the hash is self-reported at broadcast time, before any
 * confirmation, so it is labelled as such rather than presented as settlement.
 */

export type InvoiceTransactionRole = "payment" | "payout" | "broadcast";

export interface InvoiceTransaction {
  role: InvoiceTransactionRole;
  label: string;
  tx_hash: string;
  explorer_url: string | null;
  explorer_name: string | null;
  currency: string | null;
  /** True once the network (not just the payer's client) has confirmed it. */
  confirmed: boolean;
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Which chain the payment actually settled on.
 *
 * `payment_currency` is not reliable for this: CoinPay reports the *invoice*
 * currency there, so most settled invoices carry "USD" — a fiat code that
 * names no chain. The settlement chain is recorded separately where known, and
 * the receiver's payout currency is the next best witness. Candidates that
 * don't resolve to a chain (USD, SATS) are skipped rather than trusted, so the
 * order here is "most authoritative first", not "first non-empty".
 */
function settlementCurrency(meta: Record<string, unknown>): string | null {
  const candidates = [
    meta.settlement_chain,
    meta.payment_chain,
    meta.receiver_payment_currency,
    meta.payment_currency,
    meta.posting_coin,
  ];

  for (const candidate of candidates) {
    const value = str(candidate);
    if (value && explorerChain(value)) return value;
  }
  return null;
}

/**
 * Derive the transaction receipt from invoice metadata. Returns an empty list
 * for invoices with no recorded hash — legacy paid invoices, and off-chain
 * settlements, have nothing to link to.
 */
export function invoiceTransactions(metadata: unknown): InvoiceTransaction[] {
  const meta = (metadata && typeof metadata === "object" ? metadata : {}) as Record<
    string,
    unknown
  >;

  const currency = settlementCurrency(meta);
  const txHash = str(meta.tx_hash);
  const merchantTxHash = str(meta.merchant_tx_hash);
  const payerTxHash = str(meta.payer_tx_hash);

  const transactions: InvoiceTransaction[] = [];

  if (txHash) {
    transactions.push({
      role: "payment",
      label: "Payment received",
      tx_hash: txHash,
      explorer_url: explorerTxUrl(currency, txHash),
      explorer_name: explorerName(currency),
      currency,
      confirmed: true,
    });
  }

  if (merchantTxHash && merchantTxHash !== txHash) {
    transactions.push({
      role: "payout",
      label: "Payout to worker",
      tx_hash: merchantTxHash,
      explorer_url: explorerTxUrl(currency, merchantTxHash),
      explorer_name: explorerName(currency),
      currency,
      confirmed: true,
    });
  }

  // Only worth showing when the confirmed payment hash is missing or different:
  // once CoinPay reports the same transaction, the confirmed entry supersedes
  // the payer's own claim.
  if (payerTxHash && payerTxHash !== txHash && payerTxHash !== merchantTxHash) {
    const recordedExplorer = str(meta.payer_tx_explorer_url);
    transactions.push({
      role: "broadcast",
      label: "Broadcast by payer",
      tx_hash: payerTxHash,
      // The payer's wallet reports the explorer it used; fall back to ours.
      explorer_url: recordedExplorer ?? explorerTxUrl(currency, payerTxHash),
      explorer_name: recordedExplorer ? null : explorerName(currency),
      currency,
      confirmed: false,
    });
  }

  return transactions;
}
