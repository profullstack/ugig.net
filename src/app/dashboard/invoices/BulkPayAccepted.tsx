"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  CoinPayAccount,
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

export interface PayableInvoice {
  id: string;
  /** Who is owed, and for what — enough to recognise a row without opening it. */
  label: string;
  amountUsd: number;
}

interface Props {
  /** The accepted-and-unpaid invoices the signed-in user owes. */
  invoices: PayableInvoice[];
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

export function BulkPayAccepted({ invoices, totalUsd }: Props) {
  const acceptedCount = invoices.length;
  const invoiceIds = useMemo(() => invoices.map((i) => i.id), [invoices]);
  const router = useRouter();
  const [hasWallet, setHasWallet] = useState(false);
  // Everything is selected by default — paying all of them is the common case,
  // and the checkboxes exist to carve out exceptions rather than to make the
  // normal path require 80 clicks.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(invoiceIds));
  const [showRows, setShowRows] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [payments, setPayments] = useState<PreparedPayment[]>([]);
  const [skipped, setSkipped] = useState<SkippedInvoice[]>([]);
  const [progress, setProgress] = useState<Record<string, CoinPayProgress>>({});
  const [results, setResults] = useState<CoinPayBatchResult[] | null>(null);
  const [prepared, setPrepared] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<CoinPayAccount[] | null>(null);
  const [payFrom, setPayFrom] = useState<string>("");

  // The extension injects `window.coinpay` at document_start, but this
  // component can still mount first on a fast navigation — so listen for the
  // ready event as well as checking directly.
  useEffect(() => {
    const detect = () => setHasWallet(Boolean(window.coinpay?.isCoinPay));
    detect();
    window.addEventListener("coinpay#initialized", detect);
    return () => window.removeEventListener("coinpay#initialized", detect);
  }, []);

  // Forget ids that are no longer payable (paid elsewhere, revoked, refreshed
  // away). Invoices that appear later stay unticked until the payer says so —
  // never auto-select something they have not seen. Returning the same Set when
  // nothing changed keeps this from re-rendering on every parent render.
  useEffect(() => {
    setSelected((current) => {
      const known = new Set(invoiceIds);
      const kept = [...current].filter((id) => known.has(id));
      return kept.length === current.size ? current : new Set(kept);
    });
  }, [invoiceIds]);

  const selectedIds = useMemo(
    () => invoiceIds.filter((id) => selected.has(id)),
    [invoiceIds, selected]
  );
  const selectedTotal = useMemo(
    () => invoices.filter((i) => selected.has(i.id)).reduce((sum, i) => sum + i.amountUsd, 0),
    [invoices, selected]
  );
  const allSelected = selectedIds.length === invoiceIds.length && invoiceIds.length > 0;

  const toggleOne = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((current) =>
      current.size === invoiceIds.length ? new Set() : new Set(invoiceIds)
    );
  }, [invoiceIds]);

  /**
   * Mint payment requests for the given invoices (the current selection by
   * default, or just the failures when retrying). The server re-checks
   * ownership and payability, so a stale id here is skipped rather than trusted.
   */
  const prepare = useCallback(async (ids: string[] = selectedIds) => {
    if (ids.length === 0) {
      setError("Select at least one invoice to pay.");
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
  }, [selectedIds]);

  // The wallet holds several addresses per chain and a batch spends exactly
  // one. Offer the choice here rather than letting it silently default to the
  // first, which is how a funded wallet still fails every payment.
  useEffect(() => {
    if (phase !== "confirming" || accounts) return;
    const provider = window.coinpay;
    if (!provider) return;
    let cancelled = false;
    // Idempotent when already connected; only prompts the first time.
    void provider
      .connect()
      .then(({ accounts: list }) => {
        if (!cancelled) setAccounts(list ?? []);
      })
      .catch(() => {
        // Choosing an address is a convenience — never block the payment on it.
        if (!cancelled) setAccounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [phase, accounts]);

  /** Only addresses on chains this batch actually pays from. */
  const fundingOptions = useMemo(() => {
    if (!accounts?.length) return [];
    const needed = new Set(
      payments.map((p) => (p.chain.split("_").pop() ?? p.chain).toUpperCase())
    );
    return accounts.filter((a) => needed.has(a.chain.toUpperCase()));
  }, [accounts, payments]);

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
          // Empty means "wallet decides", which is its first address.
          ...(payFrom ? { from: payFrom } : {}),
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
  }, [payments, results, router, payFrom]);

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
            Pay accepted invoices
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {selectedIds.length} of {acceptedCount} selected · $
            {selectedTotal.toFixed(2)} of ${totalUsd.toFixed(2)} — one
            confirmation in your CoinPay wallet.
          </p>
        </div>

        {phase === "idle" && (
          <div className="flex shrink-0 items-center gap-2">
            {hasWallet ? (
              <Button
                type="button"
                onClick={() => void prepare()}
                disabled={selectedIds.length === 0}
                className="gap-2"
              >
                <Wallet className="h-4 w-4" />
                Pay {selectedIds.length}
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

      {/* Which invoices go in the run. Collapsed by default so the common
          "pay everything" case stays one click, but a payer settling only some
          of what they owe — or testing with a handful — needs the rows. */}
      {phase === "idle" && (
        <div className="mt-3 rounded-lg border border-border bg-background">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={allSelected}
                // Partially-selected reads as neither on nor off, and the
                // browser only exposes that through the DOM property.
                ref={(el) => {
                  if (el) el.indeterminate = selectedIds.length > 0 && !allSelected;
                }}
                onChange={toggleAll}
                className="h-4 w-4 cursor-pointer accent-emerald-600"
                aria-label={allSelected ? "Deselect all invoices" : "Select all invoices"}
              />
              {allSelected ? "Deselect all" : "Select all"}
            </label>
            <button
              type="button"
              onClick={() => setShowRows((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              aria-expanded={showRows}
            >
              {showRows ? "Hide invoices" : `Show ${acceptedCount} invoices`}
            </button>
          </div>

          {showRows && (
            <ul className="max-h-64 divide-y divide-border overflow-y-auto">
              {invoices.map((invoice) => (
                <li key={invoice.id}>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50">
                    <input
                      type="checkbox"
                      checked={selected.has(invoice.id)}
                      onChange={() => toggleOne(invoice.id)}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-emerald-600"
                    />
                    <span className="min-w-0 flex-1 truncate">{invoice.label}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      ${invoice.amountUsd.toFixed(2)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
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

          {fundingOptions.length > 1 && (
            <label className="block text-xs">
              <span className="text-muted-foreground">Pay from</span>
              <select
                value={payFrom}
                onChange={(e) => setPayFrom(e.target.value)}
                className="mt-1 w-full rounded border border-border bg-background p-1.5 font-mono text-xs"
              >
                <option value="">Wallet default (first address)</option>
                {fundingOptions.map((a) => (
                  <option key={`${a.chain}:${a.address}`} value={a.address}>
                    {a.chain} · {a.address}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-muted-foreground">
                Your wallet shows this address&apos;s balance before you approve.
              </span>
            </label>
          )}

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
