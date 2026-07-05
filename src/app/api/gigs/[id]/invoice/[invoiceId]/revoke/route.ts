import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// POST /api/gigs/[id]/invoice/[invoiceId]/revoke
// Lets the sender (the worker who billed) take back an invoice they sent before
// it's paid — e.g. they billed the wrong amount or forgot a PR link. Sets
// status='cancelled' and notifies the payer. The worker can then send a fresh
// invoice ("resend"), which the create route already allows because a cancelled
// invoice no longer counts as an open (draft/sent) one.
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
    // Only the worker who sent the invoice can revoke it. (The payer's equivalent
    // is "reject".)
    if (invoice.worker_id !== user.id) {
      return NextResponse.json(
        { error: "Only the sender can revoke this invoice" },
        { status: 403 }
      );
    }
    if (invoice.status === "paid") {
      return NextResponse.json(
        { error: "A paid invoice can't be revoked." },
        { status: 409 }
      );
    }
    if (invoice.status === "cancelled") {
      return NextResponse.json({ data: { invoice_id: invoice.id, status: "cancelled" } });
    }
    // A payer-rejected invoice is already off the table; treat revoke as a no-op
    // so the sender can just go straight to resending.
    if (invoice.status === "rejected") {
      return NextResponse.json({ data: { invoice_id: invoice.id, status: "rejected" } });
    }

    const { error: updateError } = await (supabase as any)
      .from("gig_invoices")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    const gig = Array.isArray(invoice.gig) ? invoice.gig[0] : invoice.gig;
    const title = gig?.title || "your gig";
    const serviceSupabase = createServiceClient();
    await (serviceSupabase.from("notifications") as any).insert({
      user_id: invoice.poster_id,
      type: "payment_received",
      title: "Invoice revoked",
      body: `The worker revoked their invoice for "${title}". A corrected one may follow.`,
      data: {
        gig_id: invoice.gig_id,
        invoice_id: invoice.id,
        previous_status: invoice.status,
      },
    });

    return NextResponse.json({ data: { invoice_id: invoice.id, status: "cancelled" } });
  } catch (err) {
    console.error("[revoke invoice] failed:", err);
    return NextResponse.json({ error: "Failed to revoke invoice" }, { status: 500 });
  }
}
