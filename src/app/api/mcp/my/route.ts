import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/mcp/my - Get current user's MCP listings (seller dashboard)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createServiceClient();

    const { data: listings, error } = await admin
      .from("mcp_listings" as any)
      .select("*")
      .eq("seller_id", auth.user.id)
      .neq("status", "archived")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also get sales stats
    const listingIds = (listings || []).map((l: any) => l.id);
    let totalSales = 0;
    let totalRevenue = 0;

    if (listingIds.length > 0) {
      const { data: sales } = await admin
        .from("mcp_purchases" as any)
        .select("price_sats, fee_sats")
        .eq("seller_id", auth.user.id);

      if (sales) {
        totalSales = sales.length;
        totalRevenue = sales.reduce(
          (sum: number, s: any) => sum + (s.price_sats - s.fee_sats),
          0
        );
      }
    }

    return NextResponse.json({
      listings: listings || [],
      stats: { total_sales: totalSales, total_revenue_sats: totalRevenue },
    });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
