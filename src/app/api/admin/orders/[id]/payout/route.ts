import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { isProfileAdmin } from "@/lib/orders/admin";
import { notifyOrderParty, releasePaypalOrder, transitionOrder } from "@/lib/orders/buy-now";

const actionSchema = z.discriminatedUnion("action", [
  // ugig paid the seller their share of a released PayPal order.
  z.object({
    action: z.literal("paid"),
    tx_hash: z.string().trim().min(8, "Paste the payout transaction hash or PayPal transaction ID"),
  }),
  // Resolve a dispute (or settle early) in the seller's favour: payout becomes owed.
  z.object({ action: z.literal("release") }),
  // The buyer was refunded in PayPal.
  z.object({ action: z.literal("refunded") }),
]);

// POST /api/admin/orders/[id]/payout — admin bookkeeping for PayPal Buy now orders
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createServiceClient() as never as import("@supabase/supabase-js").SupabaseClient;
  if (!(await isProfileAdmin(supabase, auth.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = actionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const { data } = await supabase
    .from("gig_orders")
    .select("id, gig_id, buyer_id, seller_id, status, amount_usd, platform_fee_usd, payment_rail, payout_status, payout_currency")
    .eq("id", id)
    .single();
  const order = data as {
    id: string; gig_id: string; buyer_id: string; seller_id: string; status: string;
    amount_usd: number; platform_fee_usd: number; payment_rail: string; payout_status: string | null;
    payout_currency: string | null;
  } | null;
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.payment_rail !== "paypal") {
    return NextResponse.json({ error: "Crypto orders settle through CoinPay escrow" }, { status: 400 });
  }

  const ref = { gig_id: order.gig_id, order_id: order.id };
  switch (parsed.data.action) {
    case "paid": {
      const { data: rows } = await supabase
        .from("gig_orders")
        .update({ payout_status: "paid", payout_tx_hash: parsed.data.tx_hash, payout_paid_at: new Date().toISOString() })
        .eq("id", id)
        .eq("payout_status", "owed")
        .select("id");
      if (!rows?.length) return NextResponse.json({ error: "No payout is owed on this order" }, { status: 409 });
      await notifyOrderParty(supabase, order.seller_id, "payment_received", "Payout sent",
        `ugig sent your payout for this order. Transaction: ${parsed.data.tx_hash}`, ref);
      return NextResponse.json({ ok: true, payout_status: "paid" });
    }
    case "release": {
      const moved =
        order.status === "disputed"
          ? await transitionOrder(supabase, id, ["disputed"], { status: "delivered" })
          : true;
      if (!moved || !(await releasePaypalOrder(supabase, order, "buyer"))) {
        return NextResponse.json({ error: `Can't release an order that is ${order.status}` }, { status: 409 });
      }
      return NextResponse.json({ ok: true, status: "released" });
    }
    case "refunded": {
      const moved = await transitionOrder(supabase, id, ["funded", "delivered", "disputed"], { status: "refunded" });
      if (!moved) return NextResponse.json({ error: `Can't refund an order that is ${order.status}` }, { status: 409 });
      await notifyOrderParty(supabase, order.buyer_id, "payment_received", "Order refunded",
        "Your PayPal payment for this order was refunded.", ref);
      return NextResponse.json({ ok: true, status: "refunded" });
    }
  }
}
