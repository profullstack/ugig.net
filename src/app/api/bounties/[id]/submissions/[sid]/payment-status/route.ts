import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { syncBountyPaymentStatus } from "@/lib/coinpay-payment-sync";
import { createServiceClient } from "@/lib/supabase/service";
import { paymentTransactions } from "@/lib/payments/receipt";

export const dynamic = "force-dynamic";

// GET /api/bounties/[id]/submissions/[sid]/payment-status
// User-triggered status refresh for a single bounty payout. Webhooks handle
// background confirmation; this lets an open bounty page update immediately.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sid: string }> }
) {
  try {
    const { id: bountyId, sid } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { user, supabase } = auth;
    const { data: submission, error } = await (supabase as any)
      .from("bounty_submissions")
      .select(
        `
          id,
          bounty_id,
          submitter_id,
          payout_status,
          coinpay_invoice_id,
          metadata,
          bounty:bounties!inner(id, creator_id)
        `
      )
      .eq("id", sid)
      .eq("bounty_id", bountyId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    const bounty = Array.isArray(submission.bounty) ? submission.bounty[0] : submission.bounty;
    if (submission.submitter_id !== user.id && bounty?.creator_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!submission.coinpay_invoice_id) {
      return NextResponse.json({
        data: {
          submission_id: sid,
          payout_status: submission.payout_status,
          coinpay_invoice_id: null,
          metadata: submission.metadata || {},
          transactions: paymentTransactions(submission.metadata),
        },
      });
    }

    const serviceSupabase = createServiceClient() as any;
    const result = await syncBountyPaymentStatus(serviceSupabase, submission.coinpay_invoice_id);

    const { data: refreshed } = await (serviceSupabase.from("bounty_submissions") as any)
      .select("id, payout_status, coinpay_invoice_id, pay_url, paid_at, metadata")
      .eq("id", sid)
      .maybeSingle();

    return NextResponse.json({
      data: {
        submission_id: sid,
        payout_status: refreshed?.payout_status || submission.payout_status,
        coinpay_invoice_id: refreshed?.coinpay_invoice_id || null,
        pay_url: refreshed?.pay_url || null,
        paid_at: refreshed?.paid_at || null,
        metadata: refreshed?.metadata || submission.metadata || {},
        // Transaction ids + explorer links, same derivation as gig invoices.
        transactions: paymentTransactions(refreshed?.metadata || submission.metadata),
        sync: result,
      },
    });
  } catch (err) {
    console.error("[bounty payment status] failed:", err);
    return NextResponse.json({ error: "Failed to check payment status" }, { status: 500 });
  }
}
