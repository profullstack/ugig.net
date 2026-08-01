"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";
import type {
  CoinPayBatchResult,
  CoinPayProgress,
} from "@/types/coinpay-extension";

/**
 * Pay every accepted invoice in one go, via the CoinPay wallet extension.
 *
 * Paying 62 accepted invoices by hand is about an hour of clicking. This
 * collapses it into: prepare all payment requests server-side → hand the whole
 * list to the extension → the user approves ONCE → transactions go out while
 * this panel streams progress.
 *
 * Each payment is still its own on-chain transaction, so partial success is
 * normal and expected. The UI is built around that: results are reported per
 * invoice, failures are named and retryable, and nothing is reported as paid
 * until it actually confirms.
 */

const EXTENSION_URL = "https://coinpayportal.com/extension";

// Invoices per prepare request. Small enough that each round-trip returns
// promptly even when the provider is pacing us, so the count keeps moving.
const PREPARE_CHUNK = 20;

interface Props {
  /** Ids of the accepted-and-unpaid invoices the signed-in user owes. */
  invoiceIds: string[];
  totalUsd: number;
}

interface PreparedPayment {
  id: string;
  chain: string;
  to: string;
  amount: string;
  label: string;
  amountUsd: number;
  expires_at: string;
}

interface SkippedInvoice {
  id: string;
  reason: string;
  /** Transient — the invoice is payable, preparing it just did not get through. */
  retryable?: boolean;
}

type Phase = "idle" | "preparing" | "confirming" | "paying" | "done";

export function BulkPayAccepted({ invoiceIds, totalUsd }: Props) {
  const acceptedCount = invoiceIds.length;
  const router = useRouter();
  const [hasWallet, setHasWallet] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [payments, setPayments] = useState<PreparedPayment[]>([]);
  const [skipped, setSkipped] = useState<SkippedInvoice[]>([]);
  const [progress, setProgress] = useState<Record<string, CoinPayProgress>>({});
  const [results, setResults] = useState<CoinPayBatchResult[] | null>(null);
  const [prepared, setPrepared] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  // The extension injects `window.coinpay` at document_start, but this
  // component can still mount first on a fast navigation — so listen for the
  // ready event as well as checking directly.
  useEffect(() => {
    const detect = () => setHasWallet(Boolean(window.coinpay?.isCoinPay));
    detect();
    window.addEventListener("coinpay#initialized", detect);
    return () => window.removeEventListener("coinpay#initialized", detect);
  }, []);

  /**
   * Mint payment requests for the given invoices (all of them by default, or
   * just the failures when retrying). The server re-checks ownership and
   * payability, so a stale id here is skipped rather than trusted.
   */
  const prepare = useCallback(async (ids: string[] = invoiceIds) => {
    if (ids.length === 0) {
      setError("No accepted invoices are ready to pay.");
      return;
    }

    setPhase("preparing");
    setError(null);
    setResults(null);
    setProgress({});
    setPrepared({ done: 0, total: ids.length });

    const allPayments: PreparedPayment[] = [];
    const allSkipped: SkippedInvoice[] = [];
    // Kept so a run that prepares nothing can still say *why*, in the server's
    // own words, rather than behind a generic failure message.
    let lastError: string | null = null;

    // Prepared in chunks rather than one long request. Minting 80 quotes has to
    // wait out the payment provider's per-minute window, and a single request
    // that sits open for that long is indistinguishable from a hang — it shows
    // nothing, and risks the edge proxy closing it. Chunking makes the count
    // move, keeps every request short, and means a failure part-way through
    // costs one chunk instead of the whole run.
    for (let i = 0; i < ids.length; i += PREPARE_CHUNK) {
      const chunk = ids.slice(i, i + PREPARE_CHUNK);
      try {
        const res = await fetch("/api/invoices/bulk-payment-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoice_ids: chunk }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not prepare the payments");

        allPayments.push(...(json.data?.payments || []));
        allSkipped.push(...(json.data?.skipped || []));
      } catch (err) {
        // Quotes already minted are still good, so keep them and mark just this
        // chunk retryable rather than discarding the whole run.
        lastError = err instanceof Error ? err.message : "Could not prepare the payments";
        allSkipped.push(
          ...chunk.map((id) => ({ id, reason: lastError!, retryable: true }))
        );
      }

      setPayments([...allPayments]);
      setSkipped([...allSkipped]);
      setPrepared({ done: Math.min(i + PREPARE_CHUNK, ids.length), total: ids.length });
    }

    if (allPayments.length === 0 && lastError) {
      setError(lastError);
      setPhase("idle");
      return;
    }

    setPhase("confirming");
  }, [invoiceIds]);

  const pay = useCallback(async () => {
    const provider = window.coinpay;
    if (!provider) {
      setError("The CoinPay wallet extension is no longer available.");
      return;
    }

    setPhase("paying");
    setError(null);

    try {
      // Connecting is idempotent — it returns immediately if already connected,
      // and otherwise prompts before we ask for a 62-payment approval.
      await provider.connect();

      const { results: batchResults } = await provider.payBatch(
        payments.map((p) => ({
          id: p.id,
          chain: p.chain,
          to: p.to,
          amount: p.amount,
          label: p.label,
          amountUsd: p.amountUsd,
        })),
        {
          onProgress: (update) =>
            setProgress((current) => ({ ...current, [update.id]: update })),
        }
      );

      setResults(batchResults);
      setPhase("done");

      // Record what was broadcast even if some failed — the audit trail is what
      // distinguishes "sent, not yet confirmed" from "never sent".
      await fetch("/api/invoices/bulk-payment-record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          results: batchResults.map((r) => ({
            invoice_id: r.id,
            status: r.status,
            tx_hash: r.txHash,
            explorer_url: r.explorerUrl,
            error: r.error,
          })),
        }),
      }).catch(() => {
        // The payments are already on-chain; a failed bookkeeping call must not
        // read as a failed payment. Confirmation still arrives via webhook.
      });

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The wallet rejected the request");
      setPhase(results ? "done" : "confirming");
    }
  }, [payments, results, router]);

  if (acceptedCount === 0) return null;

  const retryableSkips = skipped.filter((s) => s.retryable);
  const sentCount = results?.filter((r) => r.status === "sent").length ?? 0;
  const failedResults = results?.filter((r) => r.status !== "sent") ?? [];
  const labelFor = (id: string) => payments.find((p) => p.id === id)?.label || id;

  return (
    <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <Zap className="h-4 w-4 text-emerald-600" />
            Pay all accepted invoices
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {acceptedCount} invoice{acceptedCount === 1 ? "" : "s"} · $
            {totalUsd.toFixed(2)} — one confirmation in your CoinPay wallet.
          </p>
        </div>

        {phase === "idle" && (
          <div className="flex shrink-0 items-center gap-2">
            {hasWallet ? (
              <Button type="button" onClick={() => void prepare()} className="gap-2">
                <Wallet className="h-4 w-4" />
                Pay all {acceptedCount}
              </Button>
            ) : (
              <a
                href={EXTENSION_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Install the CoinPay wallet to pay in bulk
              </a>
            )}
          </div>
        )}

        {phase === "preparing" && (
          <span className="inline-flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparing payment requests… {prepared.done} of {prepared.total}
          </span>
        )}
      </div>

      {error && (
        <p className="mt-3 flex items-start gap-1.5 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      {/* Confirmation summary — the last stop before the wallet's own approval. */}
      {phase === "confirming" && (
        <div className="mt-4 space-y-3 rounded-lg border border-border bg-background p-3">
          <p className="text-sm">
            Ready to send{" "}
            <span className="font-semibold">
              {payments.length} payment{payments.length === 1 ? "" : "s"}
            </span>{" "}
            worth{" "}
            <span className="font-semibold">
              ${payments.reduce((sum, p) => sum + p.amountUsd, 0).toFixed(2)}
            </span>
            . Your wallet will show the full list and ask you to approve once.
          </p>

          <p className="text-xs text-muted-foreground">
            Each payment is quoted at the current market rate and the quotes hold
            for 15 minutes, so keep the approval window open until it finishes.
          </p>

          {skipped.length > 0 && (
            <details className="rounded border border-amber-500/30 bg-amber-500/5 p-2">
              <summary className="cursor-pointer text-xs font-medium text-amber-700">
                {skipped.length} invoice{skipped.length === 1 ? "" : "s"} will be skipped
              </summary>
              <ul className="mt-1.5 space-y-0.5">
                {skipped.map((s) => (
                  <li key={s.id} className="text-xs text-muted-foreground">
                    {s.id.slice(0, 8)}… — {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {/* A skip the payer can clear by waiting is not the same as one they
              cannot, so it gets its own action rather than living in the list. */}
          {retryableSkips.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {retryableSkips.length} of those hit a temporary limit at the payment
              provider. Prepare them again to add them to this run.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => void pay()}
              disabled={payments.length === 0}
              className="gap-2"
            >
              <Wallet className="h-4 w-4" />
              Approve in wallet
            </Button>
            {retryableSkips.length > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  // Re-prepare the whole set: the already-prepared requests are
                  // reused as-is, so this costs one provider call per invoice
                  // that is actually still missing one.
                  void prepare([
                    ...payments.map((p) => p.id),
                    ...retryableSkips.map((s) => s.id),
                  ])
                }
              >
                Prepare the {retryableSkips.length} that were limited
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => setPhase("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Live progress. The wallet's approval window shows the same run; this
          mirrors it so the dashboard reflects reality without a refresh. */}
      {phase === "paying" && (
        <div className="mt-4 space-y-2 rounded-lg border border-border bg-background p-3">
          <p className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending {Object.values(progress).filter((p) => p.stage === "sent").length} of{" "}
            {payments.length}… Approve and keep the wallet window open.
          </p>
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {payments.map((payment) => {
              const stage = progress[payment.id]?.stage;
              return (
                <li
                  key={payment.id}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="truncate text-muted-foreground">{payment.label}</span>
                  <span className="shrink-0 font-medium">
                    {stage === "sent" ? (
                      <span className="text-green-600">sent</span>
                    ) : stage === "failed" || stage === "skipped" ? (
                      <span className="text-destructive">{stage}</span>
                    ) : (
                      <span className="text-muted-foreground">{stage ?? "waiting"}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {phase === "done" && results && (
        <div className="mt-4 space-y-2 rounded-lg border border-border bg-background p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            {sentCount} payment{sentCount === 1 ? "" : "s"} broadcast
            {failedResults.length > 0 && `, ${failedResults.length} not sent`}
          </p>
          <p className="text-xs text-muted-foreground">
            Invoices flip to paid once each transaction confirms on-chain — that
            usually takes a few minutes and happens automatically.
          </p>

          {failedResults.length > 0 && (
            <div className="rounded border border-destructive/30 bg-destructive/5 p-2">
              <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                <XCircle className="h-3.5 w-3.5" />
                These were not sent — you can run the payment again for them:
              </p>
              <ul className="mt-1 space-y-0.5">
                {failedResults.map((r) => (
                  <li key={r.id} className="text-xs text-muted-foreground">
                    {labelFor(r.id)} — {r.error || "not sent"}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {failedResults.length > 0 && (
              <Button
                type="button"
                size="sm"
                onClick={() => void prepare(failedResults.map((r) => r.id))}
                className="gap-2"
              >
                Retry the {failedResults.length} that failed
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={() => setPhase("idle")}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
