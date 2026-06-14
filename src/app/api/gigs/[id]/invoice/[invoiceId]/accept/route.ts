import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// POST /api/gigs/[id]/invoice/[invoiceId]/accept
// Lets the payer (poster) accept an invoice they intend to pay. This doesn't
// move money — it flags the invoice (metadata.accepted_at) so it shows up in
// the payer's "Accepted" queue to be paid quickly, and notifies the worker
// that payment is coming.
export async function POST(
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
      .select(
        `
          id,
          gig_id,
          worker_id,
          poster_id,
          amount_usd,
          status,
          metadata,
          gig:gigs(id, title)
        `
      )
      .eq("id", invoiceId)
      .eq("gig_id", gigId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (invoice.poster_id !== user.id) {
      return NextResponse.json(
        { error: "Only the payer can accept this invoice" },
        { status: 403 }
      );
    }
    if (invoice.status === "paid") {
      return NextResponse.json(
        { error: "This invoice is already paid." },
        { status: 409 }
      );
    }
    if (invoice.status === "rejected" || invoice.status === "cancelled") {
      return NextResponse.json(
        { error: "This invoice can no longer be accepted." },
        { status: 409 }
      );
    }

    const acceptedAt = invoice.metadata?.accepted_at || new Date().toISOString();
    const alreadyAccepted = Boolean(invoice.metadata?.accepted_at);

    if (!alreadyAccepted) {
      const nextMetadata = {
        ...(invoice.metadata || {}),
        accepted_at: acceptedAt,
      };
      const { error: updateError } = await (supabase as any)
        .from("gig_invoices")
        .update({ metadata: nextMetadata, updated_at: new Date().toISOString() })
        .eq("id", invoice.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }

      const gig = Array.isArray(invoice.gig) ? invoice.gig[0] : invoice.gig;
      const title = gig?.title || "your gig";
      const serviceSupabase = createServiceClient();
      await (serviceSupabase.from("notifications") as any).insert({
        user_id: invoice.worker_id,
        type: "payment_received",
        title: "Invoice accepted",
        body: `The client accepted your invoice for "${title}" and will pay it soon.`,
        data: {
          gig_id: invoice.gig_id,
          invoice_id: invoice.id,
        },
      });
    }

    return NextResponse.json({
      data: { invoice_id: invoice.id, accepted_at: acceptedAt },
    });
  } catch (err) {
    console.error("[accept invoice] failed:", err);
    return NextResponse.json({ error: "Failed to accept invoice" }, { status: 500 });
  }
}
