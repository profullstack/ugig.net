import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;
import { validateOfferInput } from "@/lib/affiliates/validation";


/**
 * GET /api/affiliates/offers/[id] - Get offer details
 * Supports both UUID and slug lookup (#25)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const admin = createServiceClient();

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const lookupColumn = isUuid ? "id" : "slug";

    const { data: offer, error } = await (admin as AnySupabase)
      .from("affiliate_offers")
      .select(`
        *,
        profiles!affiliate_offers_seller_id_fkey(username, avatar_url),
        skill_listings(title, slug, price_sats)
      `)
      .eq(lookupColumn, id)
      .single();

    if (error || !offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }

    // Hide product_url from unauthenticated/unauthorized users (#20)
    let auth: { user: { id: string } } | null = null;
    try {
      auth = await getAuthContext(request);
    } catch {
      // not authenticated
    }

    const isOwner = auth && offer.seller_id === auth.user.id;
    let isApprovedAffiliate = false;
    if (auth && !isOwner) {
      const { data: app } = await (admin as AnySupabase)
        .from("affiliate_applications")
        .select("id")
        .eq("offer_id", offer.id)
        .eq("affiliate_id", auth.user.id)
        .eq("status", "approved")
        .single();
      isApprovedAffiliate = !!app;
    }

    if (!isOwner && !isApprovedAffiliate) {
      const { product_url, ...safeOffer } = offer;
      return NextResponse.json({ offer: safeOffer });
    }

    return NextResponse.json({ offer });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

/**
 * PATCH /api/affiliates/offers/[id] - Update an offer (seller only)
 */
export async function PATCH(
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

    // Check ownership
    const { data: existing } = await (admin as AnySupabase)
      .from("affiliate_offers")
      .select("id, seller_id")
      .eq("id", id)
      .single();

    if (!existing || existing.seller_id !== auth.user.id) {
      return NextResponse.json({ error: "Not found or not authorized" }, { status: 404 });
    }

    const body = await request.json();

    // Partial validation — only validate provided fields
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.title !== undefined) updateData.title = body.title.trim();
    if (body.description !== undefined) updateData.description = body.description.trim();
    if (body.product_url !== undefined) updateData.product_url = body.product_url;
    if (body.product_type !== undefined) updateData.product_type = body.product_type;
    if (body.price_sats !== undefined) updateData.price_sats = body.price_sats;
    if (body.commission_rate !== undefined) updateData.commission_rate = body.commission_rate;
    if (body.commission_type !== undefined) updateData.commission_type = body.commission_type;
    if (body.commission_flat_sats !== undefined) updateData.commission_flat_sats = body.commission_flat_sats;
    if (body.cookie_days !== undefined) updateData.cookie_days = body.cookie_days;
    if (body.settlement_delay_days !== undefined) updateData.settlement_delay_days = body.settlement_delay_days;
    if (body.promo_text !== undefined) updateData.promo_text = body.promo_text;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.tags !== undefined) updateData.tags = body.tags;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.auto_pay !== undefined) updateData.auto_pay = !!body.auto_pay;

    const { data: offer, error } = await (admin as AnySupabase)
      .from("affiliate_offers")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ offer });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

/**
 * DELETE /api/affiliates/offers/[id] - Archive an offer (seller only)
 */
export async function DELETE(
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

    const { data: existing } = await (admin as AnySupabase)
      .from("affiliate_offers")
      .select("id, seller_id")
      .eq("id", id)
      .single();

    if (!existing || existing.seller_id !== auth.user.id) {
      return NextResponse.json({ error: "Not found or not authorized" }, { status: 404 });
    }

    // Soft delete — archive
    await (admin as AnySupabase)
      .from("affiliate_offers")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", id);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
