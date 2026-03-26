import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { executeMcpPurchase } from "@/lib/mcp/purchase";

/**
 * POST /api/mcp/[slug]/purchase - Buy an MCP server listing
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createServiceClient();

    // Fetch listing
    const { data: listing } = await admin
      .from("mcp_listings" as any)
      .select("id, seller_id, price_sats, status, title")
      .eq("slug", slug)
      .single();

    if (!listing) {
      return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
    }

    if ((listing as any).status !== "active") {
      return NextResponse.json({ error: "MCP server is not available for purchase" }, { status: 400 });
    }

    if ((listing as any).seller_id === auth.user.id) {
      return NextResponse.json({ error: "Cannot purchase your own MCP server" }, { status: 400 });
    }

    // Check if already purchased
    const { data: existing } = await admin
      .from("mcp_purchases" as any)
      .select("id")
      .eq("listing_id", (listing as any).id)
      .eq("buyer_id", auth.user.id)
      .single();

    if (existing) {
      return NextResponse.json({ error: "Already purchased" }, { status: 409 });
    }

    // Get seller subscription plan for fee calculation
    const { data: sellerSub } = await admin
      .from("subscriptions")
      .select("plan, status")
      .eq("user_id", (listing as any).seller_id)
      .single();

    const sellerPlan =
      sellerSub?.status === "active" ? sellerSub.plan : "free";

    const result = await executeMcpPurchase(admin, {
      buyerId: auth.user.id,
      sellerId: (listing as any).seller_id,
      listingId: (listing as any).id,
      priceSats: (listing as any).price_sats,
      sellerPlan,
    });

    if (!result.ok) {
      const status = result.error === "Insufficient balance" ? 402 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    // Notify seller (non-blocking)
    try {
      const { data: buyerProfile } = await admin
        .from("profiles")
        .select("username")
        .eq("id", auth.user.id)
        .single();

      await (admin.from("notifications") as any).insert({
        user_id: (listing as any).seller_id,
        type: "mcp_purchased",
        title: "MCP server purchased! 🎉",
        body: `${buyerProfile?.username || "Someone"} purchased "${(listing as any).title}"`,
        data: {
          listing_id: (listing as any).id,
          purchase_id: result.purchase_id,
          amount_sats: (listing as any).price_sats,
          fee_sats: result.fee_sats,
        },
      });
    } catch (notifErr) {
      console.error("[mcp-purchase] Notification failed (non-fatal):", notifErr);
    }

    return NextResponse.json({
      ok: true,
      purchase_id: result.purchase_id,
      fee_sats: result.fee_sats,
      fee_rate: result.fee_rate,
      new_balance: result.new_balance,
    });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
