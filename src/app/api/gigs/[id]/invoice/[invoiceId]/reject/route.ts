import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// POST /api/gigs/[id]/invoice/[invoiceId]/reject
// Lets the payer (poster) decline an invoice they don't intend to pay.
// Sets status='rejected' and notifies the worker who sent it.
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

    // Optional note explaining why (e.g. "need links to the merged PR").
    let reason: string | null = null;
    try {
      const body = await request.json();
      if (typeof body?.reason === "string") {
        reason = body.reason.trim().slice(0, 1000) || null;
      }
    } catch {
      // No/invalid JSON body — reason stays null.
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
    if (invoice.poster_id !== user.id) {
      return NextResponse.json(
        { error: "Only the payer can reject this invoice" },
        { status: 403 }
      );
    }
    if (invoice.status === "paid") {
      return NextResponse.json(
        { error: "A paid invoice can't be rejected." },
        { status: 409 }
      );
    }
    if (invoice.status === "rejected") {
      return NextResponse.json({ data: { invoice_id: invoice.id, status: "rejected" } });
    }

    const { error: updateError } = await (supabase as any)
      .from("gig_invoices")
      .update({
        status: "rejected",
        rejection_reason: reason,
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
      user_id: invoice.worker_id,
      type: "payment_received",
      title: "Invoice rejected",
      body: reason
        ? `The client declined the invoice for "${title}": ${reason}`
        : `The client declined the invoice for "${title}".`,
      data: {
        gig_id: invoice.gig_id,
        invoice_id: invoice.id,
        previous_status: invoice.status,
        rejection_reason: reason,
      },
    });

    return NextResponse.json({ data: { invoice_id: invoice.id, status: "rejected" } });
  } catch (err) {
    console.error("[reject invoice] failed:", err);
    return NextResponse.json({ error: "Failed to reject invoice" }, { status: 500 });
  }
}
