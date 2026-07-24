import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import {
  PAYABLE_INVOICE_STATUSES,
  ensureInvoicePaymentRequest,
  metadataObject,
} from "@/lib/invoices/payment-request";

export const dynamic = "force-dynamic";

type InvoiceContext =
  | { response: NextResponse }
  | {
      gigId: string;
      invoice: any;
    };

async function loadInvoiceContext(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; invoiceId: string }> }
): Promise<InvoiceContext> {
  const { id: gigId, invoiceId } = await params;
  const auth = await getAuthContext(request);
  if (!auth) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { user, supabase } = auth;
  const { data: invoice, error } = await (supabase as any)
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
          gig:gigs(id, title, payment_coin)
        `
    )
    .eq("id", invoiceId)
    .eq("gig_id", gigId)
    .maybeSingle();

  if (error) {
    return { response: NextResponse.json({ error: error.message }, { status: 400 }) };
  }
  if (!invoice) {
    return { response: NextResponse.json({ error: "Invoice not found" }, { status: 404 }) };
  }
  if (invoice.poster_id !== user.id) {
    return {
      response: NextResponse.json(
        { error: "Only the poster can pay this invoice" },
        { status: 403 }
      ),
    };
  }
  if (invoice.status === "paid") {
    return { response: NextResponse.json({ error: "Invoice is already paid" }, { status: 400 }) };
  }
  if (!PAYABLE_INVOICE_STATUSES.has(invoice.status)) {
    return { response: NextResponse.json({ error: "Invoice is not payable" }, { status: 400 }) };
  }

  return { gigId, invoice };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; invoiceId: string }> }
): Promise<NextResponse> {
  try {
    const context = await loadInvoiceContext(request, { params });
    if ("response" in context) return context.response;

    const metadata = metadataObject(context.invoice.metadata);
    return NextResponse.json({
      data: {
        receiver_payment_currency:
          metadata.receiver_payment_currency || metadata.payment_currency || null,
        merchant_wallet_address: metadata.merchant_wallet_address || null,
        merchant_wallet_label: metadata.merchant_wallet_label || null,
      },
    });
  } catch (err) {
    console.error("[invoice payment wallets] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load CoinPay wallets" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; invoiceId: string }> }
): Promise<NextResponse> {
  try {
    const context = await loadInvoiceContext(request, { params });
    if ("response" in context) return context.response;

    const result = await ensureInvoicePaymentRequest(context.invoice);
    if (!result.ok) {
      // A missing receiving wallet is the payer's cue to ask for a fresh
      // invoice, so it stays a 400 rather than a provider-side 502.
      const status = result.code === "NO_WALLET" ? 400 : result.code === "PERSIST" ? 500 : 502;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[invoice payment request] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create payment request" },
      { status: 500 }
    );
  }
}
