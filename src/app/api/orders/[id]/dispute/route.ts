import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { disputeEscrow } from "@/lib/coinpayportal";
import { loadOrderForAction, notifyOrderParty, transitionOrder } from "@/lib/orders/buy-now";

const disputeSchema = z.object({
  reason: z.string().trim().min(10, "Describe what went wrong (at least 10 characters)").max(2000),
});

// POST /api/orders/[id]/dispute — buyer stops auto-release; an admin decides
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = disputeSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const supabase = createServiceClient();
  const order = await loadOrderForAction(supabase, id);
  if (!order || (order.seller_id !== auth.user.id && order.buyer_id !== auth.user.id)) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.buyer_id !== auth.user.id) {
    return NextResponse.json({ error: "Only the buyer can open a dispute" }, { status: 403 });
  }
  if (order.status !== "funded" && order.status !== "delivered") {
    return NextResponse.json({ error: `Only a paid order can be disputed (this one is ${order.status})` }, { status: 409 });
  }
  if (!order.coinpay_escrow_id || !order.coinpay_release_token) {
    return NextResponse.json({ error: "This order has no escrow to dispute" }, { status: 409 });
  }

  try {
    await disputeEscrow(order.coinpay_escrow_id, order.coinpay_release_token, parsed.data.reason);
  } catch (error) {
    console.error(`[orders] dispute of ${id} failed:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Dispute failed" },
      { status: 502 }
    );
  }

  await transitionOrder(supabase, id, ["funded", "delivered"], { status: "disputed" });
  await notifyOrderParty(
    supabase,
    order.seller_id,
    "gig_update",
    "Order disputed",
    "The buyer opened a dispute. Payment is on hold until it is resolved.",
    { gig_id: order.gig_id, order_id: id }
  );
  return NextResponse.json({ ok: true, status: "disputed" });
}
