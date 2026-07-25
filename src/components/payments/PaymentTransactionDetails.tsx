"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Receipt } from "lucide-react";
import { paymentTransactions } from "@/lib/payments/receipt";
import { shortTxHash } from "@/lib/explorer";

interface PaymentTransactionDetailsProps {
  metadata: Record<string, unknown> | null;
  /** CoinPay payment reference, shown when there is no on-chain hash to link. */
  coinpayInvoiceId?: string | null;
  paidAt?: string | null;
}

/**
 * On-chain receipt for a paid invoice: the transaction id(s) and a link to the
 * matching block explorer.
 *
 * Rendered identically for the client and the worker — settlement proof is only
 * useful if the party chasing the payment can see the same hash as the party
 * who sent it.
 */
export function PaymentTransactionDetails({
  metadata,
  coinpayInvoiceId,
  paidAt,
}: PaymentTransactionDetailsProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const transactions = paymentTransactions(metadata);

  const paidAtValue =
    paidAt ||
    (typeof metadata?.paid_at === "string" ? (metadata.paid_at as string) : null);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied((c) => (c === value ? null : c)), 2000);
    } catch {
      // Clipboard permission denied — the full hash is still selectable.
    }
  }

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
      <div className="mb-2 flex items-center gap-1.5">
        <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Transaction details
        </p>
      </div>

      {transactions.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No on-chain transaction was recorded for this payment.
          {coinpayInvoiceId ? " Use the payment reference below to look it up." : ""}
        </p>
      ) : (
        <ul className="space-y-2">
          {transactions.map((tx) => (
            <li key={`${tx.role}-${tx.tx_hash}`} className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-foreground">{tx.label}</span>
                {tx.currency && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                    {tx.currency.replace(/_/g, " ")}
                  </span>
                )}
                {!tx.confirmed && (
                  <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600 border border-amber-500/20">
                    Awaiting confirmation
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <code
                  title={tx.tx_hash}
                  className="break-all rounded bg-background px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                >
                  {shortTxHash(tx.tx_hash)}
                </code>
                <button
                  type="button"
                  onClick={() => copy(tx.tx_hash)}
                  aria-label={`Copy transaction id ${tx.tx_hash}`}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {copied === tx.tx_hash ? (
                    <>
                      <Check className="h-3 w-3" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" /> Copy
                    </>
                  )}
                </button>
                {tx.explorer_url && (
                  <a
                    href={tx.explorer_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {tx.explorer_name
                      ? `View on ${tx.explorer_name}`
                      : "View on block explorer"}
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {(coinpayInvoiceId || paidAtValue) && (
        <div className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
          {coinpayInvoiceId && (
            <span className="break-all">Payment reference {coinpayInvoiceId}</span>
          )}
          {coinpayInvoiceId && paidAtValue && " · "}
          {paidAtValue && <span>Paid {new Date(paidAtValue).toLocaleString()}</span>}
        </div>
      )}
    </div>
  );
}
