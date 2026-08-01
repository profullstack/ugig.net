import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { syncGigInvoicePaymentStatus } from "@/lib/coinpay-payment-sync";
import { isCoinpayRateLimitError } from "@/lib/coinpay-throttle";
import { createServiceClient } from "@/lib/supabase/service";
import { paymentTransactions } from "@/lib/payments/receipt";

export const dynamic = "force-dynamic";

// GET /api/gigs/[id]/invoice/[invoiceId]/payment-status
// User-triggered status refresh for a gig invoice. Webhooks handle background
// confirmation; this lets an open invoice page update immediately.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; invoiceId: string }> }
) {
  try {
    const { id: gigId, invoiceId } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { user, supabase } = auth;
    const { data: invoice, error } = await (supabase as any)
      .from("gig_invoices")
      .select("id, gig_id, worker_id, poster_id, status, coinpay_invoice_id, pay_url, metadata")
      .eq("id", invoiceId)
      .eq("gig_id", gigId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (invoice.worker_id !== user.id && invoice.poster_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!invoice.coinpay_invoice_id) {
      return NextResponse.json({
        data: {
          invoice_id: invoiceId,
          status: invoice.status,
          coinpay_invoice_id: null,
          pay_url: invoice.pay_url || null,
          metadata: invoice.metadata || {},
          transactions: paymentTransactions(invoice.metadata),
        },
      });
    }

    const serviceSupabase = createServiceClient() as any;
    let result;
    try {
      result = await syncGigInvoicePaymentStatus(
        serviceSupabase,
        invoice.coinpay_invoice_id
      );
    } catch (err) {
      // Skipping a refresh is not an error worth showing. The provider's
      // per-minute budget is finite and settlement arrives by webhook anyway,
      // so fall through and report what we already have.
      if (!isCoinpayRateLimitError(err)) throw err;
      result = { skipped: "rate_limited" as const };
    }

    const { data: refreshed } = await (serviceSupabase.from("gig_invoices") as any)
      .select("id, status, coinpay_invoice_id, pay_url, metadata, updated_at")
      .eq("id", invoiceId)
      .maybeSingle();

    return NextResponse.json({
      data: {
        invoice_id: invoiceId,
        status: refreshed?.status || invoice.status,
        coinpay_invoice_id: refreshed?.coinpay_invoice_id || invoice.coinpay_invoice_id,
        pay_url: refreshed?.pay_url || null,
        metadata: refreshed?.metadata || invoice.metadata || {},
        // Transaction ids + block explorer links, derived once here so every
        // client (web, CLI, agents) reads settlement proof the same way.
        transactions: paymentTransactions(refreshed?.metadata || invoice.metadata),
        updated_at: refreshed?.updated_at || null,
        sync: result,
      },
    });
  } catch (err) {
    console.error("[invoice payment status] failed:", err);
    return NextResponse.json({ error: "Failed to check payment status" }, { status: 500 });
  }
}
