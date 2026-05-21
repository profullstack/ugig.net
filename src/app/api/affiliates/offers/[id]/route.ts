import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { safeParseBody } from "@/lib/sanitize";
import { createServiceClient } from "@/lib/supabase/service";
import { validateOfferUpdateInput, type OfferInput } from "@/lib/affiliates/validation";

type AnySupabase = any;

type OfferUpdateBody = Partial<OfferInput> & { auto_pay?: unknown };

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

    const body = await safeParseBody<OfferUpdateBody>(request);
    if (!body) {
      return NextResponse.json(
        { error: "Please provide a valid JSON body" },
        { status: 400 }
      );
    }

    const { auto_pay, ...offerFields } = body;
    const validation = validateOfferUpdateInput(offerFields);
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.errors.join(", ") },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {
      ...(validation.sanitized || {}),
      updated_at: new Date().toISOString(),
    };

    if (auto_pay !== undefined) {
      if (typeof auto_pay !== "boolean") {
        return NextResponse.json(
          { error: "auto_pay must be a boolean" },
          { status: 400 }
        );
      }
      updateData.auto_pay = auto_pay;
    }

    if (Object.keys(updateData).length === 1) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

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
