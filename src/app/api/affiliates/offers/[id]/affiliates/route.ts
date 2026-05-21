import { getAppUrl } from "@/lib/app-url";
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

/**
 * GET /api/affiliates/offers/[id]/affiliates - List affiliates with stats for an offer (seller only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createServiceClient();

    // Verify seller ownership and get offer details
    const { data: offer } = await (admin as AnySupabase)
      .from("affiliate_offers")
      .select(
        "id, seller_id, title, slug, status, commission_rate, commission_type, commission_flat_sats, total_clicks, total_conversions, total_revenue_sats, total_commissions_sats, auto_pay, settlement_delay_days"
      )
      .eq("id", id)
      .single();

    if (!offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }

    if (offer.seller_id !== auth.user.id) {
      return NextResponse.json(
        { error: "Not authorized" },
        { status: 403 }
      );
    }

    // Fetch applications with affiliate profile info
    const { data: applications, error: appsErr } = await (admin as AnySupabase)
      .from("affiliate_applications")
      .select(
        `
        id,
        affiliate_id,
        status,
        tracking_code,
        created_at,
        approved_at,
        profiles!affiliate_applications_affiliate_id_fkey(username, avatar_url)
      `
      )
      .eq("offer_id", id)
      .order("created_at", { ascending: false });

    if (appsErr) {
      return NextResponse.json({ error: appsErr.message }, { status: 400 });
    }

    const affiliateList = applications || [];

    // Gather affiliate IDs for stats lookups
    const affiliateIds = affiliateList.map(
      (a: { affiliate_id: string }) => a.affiliate_id
    );

    // Fetch clicks per affiliate (last 30 days)
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    let clicksByAffiliate: Record<string, number> = {};
    if (affiliateIds.length > 0) {
      const { data: clicks } = await (admin as AnySupabase)
        .from("affiliate_clicks")
        .select("affiliate_id")
        .eq("offer_id", id)
        .in("affiliate_id", affiliateIds)
        .gte("created_at", thirtyDaysAgo);

      clicksByAffiliate = (clicks || []).reduce(
        (acc: Record<string, number>, c: { affiliate_id: string }) => {
          acc[c.affiliate_id] = (acc[c.affiliate_id] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );
    }

    // Fetch conversions per affiliate
    let conversionsByAffiliate: Record<
      string,
      { count: number; earned: number; pending: number }
    > = {};
    if (affiliateIds.length > 0) {
      const { data: conversions } = await (admin as AnySupabase)
        .from("affiliate_conversions")
        .select("affiliate_id, commission_sats, status")
        .eq("offer_id", id)
        .in("affiliate_id", affiliateIds);

      conversionsByAffiliate = (conversions || []).reduce(
        (
          acc: Record<
            string,
            { count: number; earned: number; pending: number }
          >,
          c: {
            affiliate_id: string;
            commission_sats: number;
            status: string;
          }
        ) => {
          if (!acc[c.affiliate_id]) {
            acc[c.affiliate_id] = { count: 0, earned: 0, pending: 0 };
          }
          acc[c.affiliate_id].count += 1;
          if (c.status === "paid") {
            acc[c.affiliate_id].earned += c.commission_sats || 0;
          } else if (c.status === "pending") {
            acc[c.affiliate_id].pending += c.commission_sats || 0;
          }
          return acc;
        },
        {} as Record<
          string,
          { count: number; earned: number; pending: number }
        >
      );
    }

    // Build response with per-affiliate stats
    const affiliates = affiliateList.map(
      (app: {
        id: string;
        affiliate_id: string;
        status: string;
        tracking_code: string;
        created_at: string;
        approved_at: string | null;
        profiles: { username: string; avatar_url: string | null };
      }) => {
        const convStats = conversionsByAffiliate[app.affiliate_id] || {
          count: 0,
          earned: 0,
          pending: 0,
        };
        return {
          application_id: app.id,
          affiliate_id: app.affiliate_id,
          username: app.profiles?.username || null,
          avatar_url: app.profiles?.avatar_url || null,
          status: app.status,
          tracking_code: app.tracking_code,
          tracking_url:
            app.status === "approved" && app.tracking_code
              ? `${getAppUrl(request)}/api/affiliates/click?ugig_ref=${app.tracking_code}`
              : null,
          clicks_30d: clicksByAffiliate[app.affiliate_id] || 0,
          conversions: convStats.count,
          earned_sats: convStats.earned,
          pending_sats: convStats.pending,
          applied_at: app.created_at,
          approved_at: app.approved_at,
        };
      }
    );

    // Sort: approved first, then by conversions desc
    affiliates.sort(
      (
        a: { status: string; conversions: number },
        b: { status: string; conversions: number }
      ) => {
        const statusOrder: Record<string, number> = {
          approved: 0,
          pending: 1,
          rejected: 2,
        };
        const sa = statusOrder[a.status] ?? 3;
        const sb = statusOrder[b.status] ?? 3;
        if (sa !== sb) return sa - sb;
        return b.conversions - a.conversions;
      }
    );

    return NextResponse.json({
      offer: {
        id: offer.id,
        title: offer.title,
        slug: offer.slug,
        status: offer.status,
        commission_rate: offer.commission_rate,
        commission_type: offer.commission_type,
        commission_flat_sats: offer.commission_flat_sats,
        total_clicks: offer.total_clicks || 0,
        total_conversions: offer.total_conversions || 0,
        total_revenue_sats: offer.total_revenue_sats || 0,
        total_commissions_sats: offer.total_commissions_sats || 0,
      },
      affiliates,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
