import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { recordConversion } from "@/lib/affiliates/commission";

type AnySupabase = any;

/**
 * GET /api/affiliates/offers/[id]/conversions - List conversions for an offer (seller only)
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

    // Verify seller ownership
    const { data: offer } = await (admin as AnySupabase)
      .from("affiliate_offers")
      .select("id, seller_id")
      .eq("id", id)
      .single();

    if (!offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }

    if (offer.seller_id !== auth.user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Fetch conversions — try with profile join, fallback without
    let conversions: any[] = [];
    const { data: convData, error: convErr } = await (admin as AnySupabase)
      .from("affiliate_conversions")
      .select(`
        id,
        affiliate_id,
        sale_amount_sats,
        commission_sats,
        status,
        source,
        note,
        created_at,
        profiles!affiliate_conversions_affiliate_id_fkey(username)
      `)
      .eq("offer_id", id)
      .order("created_at", { ascending: false });

    if (convErr) {
      // FK join might not exist — retry without join
      const { data: fallbackData } = await (admin as AnySupabase)
        .from("affiliate_conversions")
        .select("id, affiliate_id, sale_amount_sats, commission_sats, status, source, note, created_at")
        .eq("offer_id", id)
        .order("created_at", { ascending: false });
      conversions = fallbackData || [];
    } else {
      conversions = convData || [];
    }

    const list = conversions.map(
      (c: {
        id: string;
        affiliate_id: string;
        sale_amount_sats: number;
        commission_sats: number;
        status: string;
        source: string | null;
        note: string | null;
        created_at: string;
        profiles?: { username: string } | null;
      }) => ({
        id: c.id,
        affiliate_id: c.affiliate_id,
        username: c.profiles?.username || null,
        sale_amount_sats: c.sale_amount_sats,
        commission_sats: c.commission_sats,
        status: c.status,
        source: c.source || "auto",
        note: c.note || null,
        created_at: c.created_at,
      })
    );

    return NextResponse.json({ conversions: list });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/affiliates/offers/[id]/conversions - Record a manual conversion (seller only)
 */
export async function POST(
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

    // Verify seller ownership
    const { data: offer } = await (admin as AnySupabase)
      .from("affiliate_offers")
      .select("id, seller_id")
      .eq("id", id)
      .single();

    if (!offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }

    if (offer.seller_id !== auth.user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const { affiliate_id, sale_amount_sats, note } = body;

    if (!affiliate_id || typeof affiliate_id !== "string") {
      return NextResponse.json(
        { error: "affiliate_id is required" },
        { status: 400 }
      );
    }

    if (!sale_amount_sats || typeof sale_amount_sats !== "number" || sale_amount_sats <= 0) {
      return NextResponse.json(
        { error: "sale_amount_sats must be a positive number" },
        { status: 400 }
      );
    }

    if (note !== undefined && note !== null && typeof note !== "string") {
      return NextResponse.json({ error: "note must be a string" }, { status: 400 });
    }

    // Verify the affiliate is approved for this offer
    const { data: application } = await (admin as AnySupabase)
      .from("affiliate_applications")
      .select("id, status")
      .eq("offer_id", id)
      .eq("affiliate_id", affiliate_id)
      .eq("status", "approved")
      .single();

    if (!application) {
      return NextResponse.json(
        { error: "Affiliate is not approved for this offer" },
        { status: 400 }
      );
    }

    // Use the shared recordConversion helper, then update the source to "manual"
    const result = await recordConversion(admin, {
      offerId: id,
      affiliateId: affiliate_id,
      saleAmountSats: sale_amount_sats,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Update source and note on the created conversion
    const updateData: Record<string, unknown> = { source: "manual" };
    if (note && typeof note === "string") {
      updateData.note = note.trim();
    }

    await (admin as AnySupabase)
      .from("affiliate_conversions")
      .update(updateData)
      .eq("id", result.conversion_id);

    return NextResponse.json({
      conversion: {
        id: result.conversion_id,
        commission_sats: result.commission_sats,
        settles_at: result.settles_at,
        source: "manual",
        note: typeof note === "string" ? note.trim() || null : null,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/affiliates/offers/[id]/conversions - Update a conversion (seller only)
 * Body: { conversion_id, sale_amount_sats?, note?, status? }
 */
export async function PUT(
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

    const { data: offer } = await (admin as AnySupabase)
      .from("affiliate_offers")
      .select("id, seller_id, commission_rate, commission_type, commission_flat_sats")
      .eq("id", id)
      .single();

    if (!offer || offer.seller_id !== auth.user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const { conversion_id, sale_amount_sats, note, status } = body;

    if (!conversion_id) {
      return NextResponse.json({ error: "conversion_id is required" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (typeof note === "string") updateData.note = note.trim();
    if (typeof status === "string" && ["pending", "paid", "clawed_back"].includes(status)) {
      updateData.status = status;
    }
    if (typeof sale_amount_sats === "number" && sale_amount_sats > 0) {
      updateData.sale_amount_sats = sale_amount_sats;
      const { calculateCommission } = await import("@/lib/affiliates/commission");
      updateData.commission_sats = calculateCommission(offer, sale_amount_sats);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { error: updateErr } = await (admin as AnySupabase)
      .from("affiliate_conversions")
      .update(updateData)
      .eq("id", conversion_id)
      .eq("offer_id", id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

/**
 * DELETE /api/affiliates/offers/[id]/conversions - Delete a conversion (seller only)
 * Body: { conversion_id }
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

    const { data: offer } = await (admin as AnySupabase)
      .from("affiliate_offers")
      .select("id, seller_id")
      .eq("id", id)
      .single();

    if (!offer || offer.seller_id !== auth.user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const { conversion_id } = body;

    if (!conversion_id) {
      return NextResponse.json({ error: "conversion_id is required" }, { status: 400 });
    }

    const { data: conv } = await (admin as AnySupabase)
      .from("affiliate_conversions")
      .select("id, status")
      .eq("id", conversion_id)
      .eq("offer_id", id)
      .single();

    if (!conv) {
      return NextResponse.json({ error: "Conversion not found" }, { status: 404 });
    }

    if (conv.status === "paid") {
      return NextResponse.json({ error: "Cannot delete a paid conversion" }, { status: 400 });
    }

    const { error: delErr } = await (admin as AnySupabase)
      .from("affiliate_conversions")
      .delete()
      .eq("id", conversion_id)
      .eq("offer_id", id);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
