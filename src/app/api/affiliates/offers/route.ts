import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;
import { validateOfferInput } from "@/lib/affiliates/validation";


function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/**
 * GET /api/affiliates/offers - List affiliate offers (public marketplace)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const category = searchParams.get("category");
    const tag = searchParams.get("tag");
    const sort = searchParams.get("sort") || "newest";
    const search = (searchParams.get("q") || "").slice(0, 200) || null;

    const admin = createServiceClient();
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = (admin as AnySupabase)
      .from("affiliate_offers")
      .select(`
        *,
        profiles!affiliate_offers_seller_id_fkey(username, avatar_url),
        skill_listings(title, slug)
      `, { count: "exact" })
      .eq("status", "active");

    if (category) {
      query = query.eq("category", category);
    }

    if (tag) {
      query = query.contains("tags", [tag]);
    }

    const slugFilter = searchParams.get("slug");
    if (slugFilter) {
      query = query.eq("slug", slugFilter);
    } else if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Sort
    switch (sort) {
      case "commission":
        query = query.order("commission_flat_sats", { ascending: false });
        break;
      case "popular":
        query = query.order("total_affiliates", { ascending: false });
        break;
      case "revenue":
        query = query.order("total_revenue_sats", { ascending: false });
        break;
      default:
        query = query.order("created_at", { ascending: false });
    }

    query = query.range(from, to);

    const { data: offers, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Hide product_url from unauthenticated users (#20)
    let auth: { user: { id: string } } | null = null;
    try {
      auth = await getAuthContext(request);
    } catch {
      // not authenticated
    }

    let approvedOfferIds: Set<string> = new Set();
    if (auth) {
      // Check which offers this user is an approved affiliate for
      const { data: apps } = await (admin as AnySupabase)
        .from("affiliate_applications")
        .select("offer_id")
        .eq("affiliate_id", auth.user.id)
        .eq("status", "approved");
      if (apps) {
        approvedOfferIds = new Set(apps.map((a: any) => a.offer_id));
      }
    }

    const sanitizedOffers = (offers || []).map((offer: any) => {
      const isOwner = auth && offer.seller_id === auth.user.id;
      const isApprovedAffiliate = auth && approvedOfferIds.has(offer.id);
      if (!isOwner && !isApprovedAffiliate) {
        const { product_url, ...rest } = offer;
        return rest;
      }
      return offer;
    });

    return NextResponse.json({
      offers: sanitizedOffers,
      total: count || 0,
      page,
      limit,
    });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

/**
 * POST /api/affiliates/offers - Create a new affiliate offer
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = checkRateLimit(getRateLimitIdentifier(request, auth.user.id), "write");
    if (!rl.allowed) return rateLimitExceeded(rl);

    const body = await request.json();
    const validation = validateOfferInput(body);

    if (!validation.ok) {
      return NextResponse.json({ error: validation.errors.join("; ") }, { status: 400 });
    }

    const input = validation.sanitized!;
    const admin = createServiceClient();

    // Generate slug
    let slug = slugify(input.title);
    const { data: existing } = await (admin as AnySupabase)
      .from("affiliate_offers")
      .select("id")
      .eq("slug", slug)
      .single();

    if (existing) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 10)}`;
    }

    const { data: offer, error } = await (admin as AnySupabase)
      .from("affiliate_offers")
      .insert({
        seller_id: auth.user.id,
        slug,
        title: input.title,
        description: input.description,
        product_url: input.product_url || null,
        product_type: input.product_type,
        price_sats: input.price_sats,
        commission_rate: input.commission_rate,
        commission_type: input.commission_type,
        commission_flat_sats: input.commission_flat_sats || 0,
        cookie_days: input.cookie_days,
        settlement_delay_days: input.settlement_delay_days,
        promo_text: input.promo_text || null,
        category: input.category || null,
        tags: input.tags || [],
        listing_id: input.listing_id || null,
        status: input.status || "active",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ offer }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
