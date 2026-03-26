import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;


/**
 * GET /api/affiliates/my - Get my affiliate dashboard data
 * Returns: offers I'm promoting, my conversions, and my offers (as seller)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "affiliate"; // affiliate | seller

    const admin = createServiceClient();

    if (view === "seller") {
      // My offers as a seller
      const { data: offers, error: offersErr } = await (admin as AnySupabase)
        .from("affiliate_offers")
        .select("*")
        .eq("seller_id", auth.user.id)
        .neq("status", "archived")
        .order("created_at", { ascending: false });

      if (offersErr) {
        return NextResponse.json({ error: offersErr.message }, { status: 400 });
      }

      // Aggregate stats
      const totalRevenue = (offers || []).reduce((sum: number, o: any) => sum + (o.total_revenue_sats || 0), 0);
      const totalCommissions = (offers || []).reduce((sum: number, o: any) => sum + (o.total_commissions_sats || 0), 0);
      const totalAffiliates = (offers || []).reduce((sum: number, o: any) => sum + (o.total_affiliates || 0), 0);

      return NextResponse.json({
        view: "seller",
        offers: offers || [],
        stats: {
          total_offers: (offers || []).length,
          total_revenue_sats: totalRevenue,
          total_commissions_sats: totalCommissions,
          total_affiliates: totalAffiliates,
        },
      });
    }

    // My applications as an affiliate
    const { data: applications, error: appsErr } = await (admin as AnySupabase)
      .from("affiliate_applications")
      .select(`
        *,
        affiliate_offers(id, title, slug, commission_rate, commission_type, commission_flat_sats, price_sats, status,
          profiles!affiliate_offers_seller_id_fkey(username))
      `)
      .eq("affiliate_id", auth.user.id)
      .order("created_at", { ascending: false });

    if (appsErr) {
      return NextResponse.json({ error: appsErr.message }, { status: 400 });
    }

    // My conversions
    const { data: conversions, error: convErr } = await (admin as AnySupabase)
      .from("affiliate_conversions")
      .select(`
        *,
        affiliate_offers(title, slug)
      `)
      .eq("affiliate_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (convErr) {
      return NextResponse.json({ error: convErr.message }, { status: 400 });
    }

    // My click stats (aggregated per offer)
    const { data: clicks } = await (admin as AnySupabase)
      .from("affiliate_clicks")
      .select("offer_id, created_at")
      .eq("affiliate_id", auth.user.id)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    // Aggregate
    const totalEarned = (conversions || [])
      .filter((c: any) => c.status === "paid")
      .reduce((sum: number, c: any) => sum + (c.commission_sats || 0), 0);
    const totalPending = (conversions || [])
      .filter((c: any) => c.status === "pending")
      .reduce((sum: number, c: any) => sum + (c.commission_sats || 0), 0);

    return NextResponse.json({
      view: "affiliate",
      applications: applications || [],
      conversions: conversions || [],
      stats: {
        total_clicks_30d: (clicks || []).length,
        total_conversions: (conversions || []).length,
        total_earned_sats: totalEarned,
        total_pending_sats: totalPending,
        active_offers: (applications || []).filter((a: any) => a.status === "approved").length,
      },
    });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
