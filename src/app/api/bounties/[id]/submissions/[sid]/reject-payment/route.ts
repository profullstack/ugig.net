import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// POST /api/bounties/[id]/submissions/[sid]/reject-payment
// Lets the bounty creator decline to pay an approved submission
// (e.g. the submitter's CoinPay wallet is not connected / OAuth missing).
// Sets payout_status='rejected' and notifies the submitter.
export async function POST(
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

    const { data: bounty } = await (supabase as any)
      .from("bounties")
      .select("id, creator_id, title")
      .eq("id", bountyId)
      .single();

    if (!bounty) {
      return NextResponse.json({ error: "Bounty not found" }, { status: 404 });
    }
    if (bounty.creator_id !== user.id) {
      return NextResponse.json(
        { error: "Only the bounty creator can reject a payout" },
        { status: 403 }
      );
    }

    const { data: submission, error: subError } = await (supabase as any)
      .from("bounty_submissions")
      .select("id, submitter_id, status, payout_status")
      .eq("id", sid)
      .eq("bounty_id", bountyId)
      .single();

    if (subError || !submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }
    if (submission.status !== "approved") {
      return NextResponse.json(
        { error: "Only approved submissions can have their payment rejected" },
        { status: 400 }
      );
    }
    if (submission.payout_status === "paid") {
      return NextResponse.json(
        { error: "This submission has already been paid" },
        { status: 409 }
      );
    }
    if (submission.payout_status === "rejected") {
      return NextResponse.json({ data: { submission_id: sid, payout_status: "rejected" } });
    }

    const { error: updateError } = await (supabase as any)
      .from("bounty_submissions")
      .update({ payout_status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", sid);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    const serviceSupabase = createServiceClient();
    await (serviceSupabase.from("notifications") as any).insert({
      user_id: submission.submitter_id,
      type: "payment_received",
      title: "Bounty payout rejected",
      body: `The creator could not complete the payout for "${bounty.title}". Check the payout wallet on your profile (PUT /api/profile/wallet-addresses, or connect CoinPay) and contact the creator.`,
      data: {
        bounty_id: bountyId,
        submission_id: sid,
        previous_payout_status: submission.payout_status,
      },
    });

    return NextResponse.json({ data: { submission_id: sid, payout_status: "rejected" } });
  } catch (err) {
    console.error("[reject bounty payment] failed:", err);
    return NextResponse.json({ error: "Failed to reject payment" }, { status: 500 });
  }
}
