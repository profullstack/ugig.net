import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { releaseEscrow } from "@/lib/coinpayportal";
import { loadOrderForAction, notifyOrderParty, releasePaypalOrder, transitionOrder } from "@/lib/orders/buy-now";

// POST /api/orders/[id]/release — buyer releases the escrow to the seller
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();
  const order = await loadOrderForAction(supabase, id);
  if (!order || (order.seller_id !== auth.user.id && order.buyer_id !== auth.user.id)) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.buyer_id !== auth.user.id) {
    return NextResponse.json({ error: "Only the buyer can release payment" }, { status: 403 });
  }
  if (order.status !== "funded" && order.status !== "delivered") {
    return NextResponse.json({ error: `Only a paid order can be released (this one is ${order.status})` }, { status: 409 });
  }
  if (order.payment_rail === "paypal") {
    const released = await releasePaypalOrder(supabase, order, "buyer");
    if (!released) return NextResponse.json({ error: "Order was already released" }, { status: 409 });
    return NextResponse.json({ ok: true, status: "released" });
  }

  if (!order.coinpay_escrow_id || !order.coinpay_release_token) {
    return NextResponse.json({ error: "This order has no escrow to release" }, { status: 409 });
  }

  try {
    await releaseEscrow(order.coinpay_escrow_id, order.coinpay_release_token);
  } catch (error) {
    console.error(`[orders] release of ${id} failed:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Release failed" },
      { status: 502 }
    );
  }

  await transitionOrder(supabase, id, ["funded", "delivered"], {
    status: "released",
    released_at: new Date().toISOString(),
  });

  const net = Math.round((order.amount_usd - order.platform_fee_usd) * 100) / 100;
  await notifyOrderParty(
    supabase,
    order.seller_id,
    "payment_received",
    "Payment released",
    `The buyer released $${net} to your CoinPay wallet. It arrives once the escrow settles on-chain.`,
    { gig_id: order.gig_id, order_id: id }
  );
  return NextResponse.json({ ok: true, status: "released" });
}
