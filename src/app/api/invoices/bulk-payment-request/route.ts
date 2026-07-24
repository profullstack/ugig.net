import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/get-user";
import {
  PAYABLE_INVOICE_STATUSES,
  ensureInvoicePaymentRequest,
  metadataObject,
} from "@/lib/invoices/payment-request";

export const dynamic = "force-dynamic";

/**
 * POST /api/invoices/bulk-payment-request
 *
 * Mint (or reuse) a live CoinPay payment request for many accepted invoices at
 * once, so the wallet extension can pay them all behind a single approval.
 *
 * Paying 62 invoices one at a time is roughly an hour of clicking; this is the
 * server half of collapsing that into one confirmation.
 *
 * Returns a `payments` array shaped for `window.coinpay.payBatch()` plus a
 * `skipped` array explaining every invoice that could NOT be prepared. Nothing
 * is silently dropped — an invoice missing from both arrays would look paid
 * when it never was.
 */

// Each entry costs a CoinPay API round-trip, and every minted request starts a
// 15-minute expiry clock that must outlast the on-chain sending that follows.
const MAX_INVOICES = 100;

// Enough concurrency to prepare 62 requests in seconds, low enough to stay
// friendly to the payment provider's rate limits.
const CONCURRENCY = 5;

const bulkPaymentRequestSchema = z.object({
  invoice_ids: z.array(z.string().uuid()).min(1).max(MAX_INVOICES),
});

export interface BulkPaymentItem {
  /** The invoice id — echoed back by the wallet as the result correlation id. */
  id: string;
  gig_id: string;
  /** CoinPay currency code (e.g. `usdc_pol`); the wallet maps it to a chain. */
  chain: string;
  /** CoinPay-issued deposit address for this specific invoice. */
  to: string;
  /** Crypto amount, quoted at the market rate when the request was created. */
  amount: string;
  label: string;
  amountUsd: number;
  expires_at: string;
  /** True when an unexpired request already existed and was reused. */
  reused: boolean;
}

export interface BulkPaymentSkip {
  id: string;
  reason: string;
}

/** Run tasks with a bounded number in flight, preserving input order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]!);
    }
  });

  await Promise.all(workers);
  return results;
}

function counterpartyLabel(invoice: any): string {
  const worker = Array.isArray(invoice.worker) ? invoice.worker[0] : invoice.worker;
  const gig = Array.isArray(invoice.gig) ? invoice.gig[0] : invoice.gig;
  const name = worker?.full_name || worker?.username || "Unknown worker";
  return gig?.title ? `${name} — ${gig.title}` : name;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = bulkPaymentRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]!.message }, { status: 400 });
    }

    const invoiceIds = [...new Set(parsed.data.invoice_ids)];

    const { data: invoiceData, error } = await (supabase as any)
      .from("gig_invoices")
      .select(
        `
        id,
        gig_id,
        application_id,
        worker_id,
        poster_id,
        amount_usd,
        currency,
        status,
        coinpay_invoice_id,
        pay_url,
        notes,
        metadata,
        gig:gigs(id, title, payment_coin),
        worker:profiles!worker_id (id, username, full_name)
      `
      )
      .in("id", invoiceIds)
      // Only the payer may create payment requests, enforced in the query so a
      // forged id can never reach the provider call below.
      .eq("poster_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const invoices = (invoiceData || []) as any[];
    const found = new Map(invoices.map((invoice) => [invoice.id, invoice]));

    const skipped: BulkPaymentSkip[] = [];
    const payable: any[] = [];

    for (const id of invoiceIds) {
      const invoice = found.get(id);
      if (!invoice) {
        skipped.push({ id, reason: "Not found, or you are not the payer" });
        continue;
      }
      if (invoice.status === "paid") {
        skipped.push({ id, reason: "Already paid" });
        continue;
      }
      if (!PAYABLE_INVOICE_STATUSES.has(invoice.status)) {
        skipped.push({ id, reason: `Invoice is ${invoice.status}` });
        continue;
      }
      if (!metadataObject(invoice.metadata).accepted_at) {
        // Bulk pay is the "Accepted" queue's action; accepting stays a
        // deliberate, per-invoice decision.
        skipped.push({ id, reason: "Not accepted yet" });
        continue;
      }
      payable.push(invoice);
    }

    const prepared = await mapWithConcurrency(payable, CONCURRENCY, async (invoice) => {
      try {
        const result = await ensureInvoicePaymentRequest(invoice);
        if (!result.ok) return { invoice, error: result.error };
        return { invoice, data: result.data, reused: result.reused };
      } catch (err) {
        return {
          invoice,
          error: err instanceof Error ? err.message : "Failed to create payment request",
        };
      }
    });

    const payments: BulkPaymentItem[] = [];
    for (const entry of prepared) {
      if (!("data" in entry) || !entry.data) {
        skipped.push({ id: entry.invoice.id, reason: entry.error || "Could not be prepared" });
        continue;
      }

      const amount = entry.data.amount_crypto;
      if (amount === null || amount === undefined || !(Number(amount) > 0)) {
        // Without a quoted crypto amount there is nothing safe to send.
        skipped.push({ id: entry.invoice.id, reason: "CoinPay did not quote a crypto amount" });
        continue;
      }

      payments.push({
        id: entry.invoice.id,
        gig_id: entry.invoice.gig_id,
        chain: entry.data.payment_currency,
        to: entry.data.payment_address,
        amount: String(amount),
        label: counterpartyLabel(entry.invoice),
        amountUsd: Number(entry.invoice.amount_usd) || 0,
        expires_at: entry.data.expires_at,
        reused: entry.reused,
      });
    }

    return NextResponse.json({
      data: {
        payments,
        skipped,
        total_usd: payments.reduce((sum, p) => sum + p.amountUsd, 0),
      },
    });
  } catch (err) {
    console.error("[bulk payment request] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create payment requests" },
      { status: 500 }
    );
  }
}
