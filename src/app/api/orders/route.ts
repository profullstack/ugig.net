import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { ORDER_PUBLIC_COLUMNS } from "@/lib/orders/buy-now";
import { maskOrderPayout } from "@/lib/orders/paypal-payout";

// GET /api/orders?role=buyer|seller|all — the caller's Buy now orders
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = auth.user.id;
  const role = request.nextUrl.searchParams.get("role") || "all";

  let query = createServiceClient()
    .from("gig_orders" as never)
    .select(
      `${ORDER_PUBLIC_COLUMNS}, gig:gigs(id, title), ` +
        "buyer:profiles!gig_orders_buyer_id_fkey(id, username, avatar_url), " +
        "seller:profiles!gig_orders_seller_id_fkey(id, username, avatar_url)"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (role === "buyer") query = query.eq("buyer_id", userId);
  else if (role === "seller") query = query.eq("seller_id", userId);
  else query = query.or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

  const { data, error } = await query;
  if (error) {
    console.error("[orders] list failed:", error);
    return NextResponse.json({ error: "Failed to load orders" }, { status: 500 });
  }
  return NextResponse.json({
    orders: ((data ?? []) as Record<string, unknown>[]).map((o) => maskOrderPayout(o, userId)),
  });
}
