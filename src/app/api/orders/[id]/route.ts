import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { ORDER_PUBLIC_COLUMNS } from "@/lib/orders/buy-now";

// GET /api/orders/[id] — one order, for its buyer or seller
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await createServiceClient()
    .from("gig_orders" as never)
    .select(`${ORDER_PUBLIC_COLUMNS}, gig:gigs(id, title)`)
    .eq("id", id)
    .single();
  const order = data as { buyer_id: string; seller_id: string } | null;
  if (!order || (order.buyer_id !== auth.user.id && order.seller_id !== auth.user.id)) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  return NextResponse.json({ order });
}
