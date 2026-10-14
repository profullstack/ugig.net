import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { loadOrderForAction, notifyOrderParty, transitionOrder } from "@/lib/orders/buy-now";

const deliverSchema = z.object({ note: z.string().trim().max(5000).optional() });

// POST /api/orders/[id]/deliver — seller says the work is done
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = deliverSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const supabase = createServiceClient();
  const order = await loadOrderForAction(supabase, id);
  if (!order || (order.seller_id !== auth.user.id && order.buyer_id !== auth.user.id)) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.seller_id !== auth.user.id) {
    return NextResponse.json({ error: "Only the seller can mark an order delivered" }, { status: 403 });
  }

  const moved = await transitionOrder(supabase, id, ["funded"], {
    status: "delivered",
    delivered_at: new Date().toISOString(),
    delivery_note: parsed.data.note || null,
  });
  if (!moved) {
    return NextResponse.json({ error: `Only a paid order can be delivered (this one is ${order.status})` }, { status: 409 });
  }

  await notifyOrderParty(
    supabase,
    order.buyer_id,
    "gig_update",
    "Your order was delivered",
    "The seller marked your order delivered. Review it, then release the payment from Orders.",
    { gig_id: order.gig_id, order_id: id }
  );
  return NextResponse.json({ ok: true, status: "delivered" });
}
