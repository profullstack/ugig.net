import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { metadataObject } from "@/lib/invoices/payment-request";

export const dynamic = "force-dynamic";

/**
 * POST /api/invoices/bulk-payment-record
 *
 * Record what the wallet extension actually broadcast for each invoice in a
 * bulk run: the transaction hash, or the error if it never went out.
 *
 * This deliberately does NOT mark anything paid. A broadcast transaction is a
 * claim, not a settlement — it can still be dropped or replaced. Confirmation
 * stays with the CoinPay webhook and `syncGigInvoicePaymentStatus`, which watch
 * the deposit address. Trusting the payer's own report here would let a
 * self-reported hash flip an invoice to paid.
 *
 * What it buys us: an audit trail, so a payment that broadcast but hasn't
 * confirmed is distinguishable from one that was never sent — the difference
 * between "wait" and "pay again".
 */

const MAX_RESULTS = 100;

const resultSchema = z.object({
  invoice_id: z.string().uuid(),
  status: z.enum(["sent", "failed", "skipped"]),
  tx_hash: z.string().min(1).max(200).optional(),
  explorer_url: z.string().url().max(500).optional(),
  error: z.string().max(500).optional(),
});

const bulkRecordSchema = z.object({
  results: z.array(resultSchema).min(1).max(MAX_RESULTS),
});

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

    const parsed = bulkRecordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]!.message }, { status: 400 });
    }

    const results = parsed.data.results;
    const invoiceIds = [...new Set(results.map((r) => r.invoice_id))];

    const { data: invoiceData, error } = await (supabase as any)
      .from("gig_invoices")
      .select("id, status, metadata")
      .in("id", invoiceIds)
      .eq("poster_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const invoices = new Map((invoiceData || []).map((inv: any) => [inv.id, inv]));
    const serviceSupabase = createServiceClient() as any;

    let recorded = 0;
    const unknown: string[] = [];
    const recordedAt = new Date().toISOString();

    for (const result of results) {
      const invoice = invoices.get(result.invoice_id) as any;
      if (!invoice) {
        unknown.push(result.invoice_id);
        continue;
      }

      const metadata = metadataObject(invoice.metadata);
      // Keep a full history: a retried invoice has more than one broadcast, and
      // the earlier hashes are what explain a duplicate on-chain payment.
      const attempts = Array.isArray(metadata.bulk_payment_attempts)
        ? metadata.bulk_payment_attempts
        : [];

      const nextMetadata = {
        ...metadata,
        bulk_payment_attempts: [
          ...attempts,
          {
            status: result.status,
            tx_hash: result.tx_hash ?? null,
            explorer_url: result.explorer_url ?? null,
            error: result.error ?? null,
            recorded_at: recordedAt,
          },
        ],
        ...(result.status === "sent"
          ? {
              payer_tx_hash: result.tx_hash ?? null,
              payer_tx_explorer_url: result.explorer_url ?? null,
              payer_tx_broadcast_at: recordedAt,
              // Surfaced in the UI as "sent, awaiting confirmation" — the
              // webhook still owns the transition to `paid`.
              coinpay_status: metadata.coinpay_status === "paid" ? "paid" : "broadcast",
            }
          : {
              last_bulk_payment_error: result.error ?? "Payment was not sent",
            }),
      };

      const { error: updateError } = await (serviceSupabase.from("gig_invoices") as any)
        .update({ metadata: nextMetadata, updated_at: recordedAt })
        .eq("id", result.invoice_id);

      if (updateError) {
        console.error("[bulk payment record] update failed:", result.invoice_id, updateError);
        continue;
      }
      recorded++;
    }

    return NextResponse.json({
      data: {
        recorded,
        unknown,
        sent: results.filter((r) => r.status === "sent").length,
        failed: results.filter((r) => r.status !== "sent").length,
      },
    });
  } catch (err) {
    console.error("[bulk payment record] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to record payments" },
      { status: 500 }
    );
  }
}
