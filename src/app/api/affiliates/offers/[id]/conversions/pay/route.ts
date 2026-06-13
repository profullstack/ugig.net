import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserLnWallet, internalTransfer } from "@/lib/lightning/wallet-utils";

type AnySupabase = any;

/**
 * POST /api/affiliates/offers/[id]/conversions/pay
 * Body: { conversion_id }
 * Pays the affiliate commission via LNbits internal transfer.
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const conversion_id =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>).conversion_id
        : undefined;

    if (typeof conversion_id !== "string" || conversion_id.trim() === "") {
      return NextResponse.json(
        { error: "conversion_id must be a non-empty string" },
        { status: 400 }
      );
    }
    const conversionId = conversion_id.trim();

    const admin = createServiceClient();

    // Verify seller ownership
    const { data: offer } = await (admin as AnySupabase)
      .from("affiliate_offers")
      .select("id, seller_id")
      .eq("id", id)
      .single();

    if (!offer || offer.seller_id !== auth.user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Get the conversion
    const { data: conv } = await (admin as AnySupabase)
      .from("affiliate_conversions")
      .select("id, affiliate_id, commission_sats, status, settles_at")
      .eq("id", conversionId)
      .eq("offer_id", id)
      .single();

    if (!conv) {
      return NextResponse.json({ error: "Conversion not found" }, { status: 404 });
    }

    if (conv.status === "paid") {
      return NextResponse.json({ error: "Already paid" }, { status: 400 });
    }

    if (conv.status === "clawed_back") {
      return NextResponse.json({ error: "Cannot pay a clawed back conversion" }, { status: 400 });
    }

    if (conv.settles_at && new Date(conv.settles_at) > new Date()) {
      return NextResponse.json({ error: "Conversion has not settled yet" }, { status: 400 });
    }

    if (conv.commission_sats <= 0) {
      return NextResponse.json({ error: "Commission amount is zero" }, { status: 400 });
    }

    // Get seller's LN wallet (payer)
    const sellerWallet = await getUserLnWallet(admin, auth.user.id);
    if (!sellerWallet) {
      return NextResponse.json({ error: "Seller has no Lightning wallet" }, { status: 400 });
    }

    // Get affiliate's LN wallet (payee)
    const affiliateWallet = await getUserLnWallet(admin, conv.affiliate_id);
    if (!affiliateWallet) {
      return NextResponse.json({ error: "Affiliate has no Lightning wallet" }, { status: 400 });
    }

    // Transfer commission from seller → affiliate
    try {
      await internalTransfer(
        sellerWallet.admin_key,
        affiliateWallet.invoice_key,
        conv.commission_sats,
        `Affiliate commission payout (offer ${id})`
      );
    } catch (err: any) {
      console.error("[Affiliate Pay] Transfer failed:", err.message);
      return NextResponse.json(
        { error: `Payment failed: ${err.message}` },
        { status: 500 }
      );
    }

    // Mark as paid
    await (admin as AnySupabase)
      .from("affiliate_conversions")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
      })
      .eq("id", conversionId);

    // Record wallet transactions for both parties
    await (admin as AnySupabase)
      .from("wallet_transactions")
      .insert([
        {
          user_id: auth.user.id,
          type: "affiliate_payout",
          amount_sats: -conv.commission_sats,
          balance_after: 0, // will be corrected on next sync
          status: "completed",
        },
        {
          user_id: conv.affiliate_id,
          type: "affiliate_commission",
          amount_sats: conv.commission_sats,
          balance_after: 0, // will be corrected on next sync
          status: "completed",
        },
      ]);

    return NextResponse.json({
      ok: true,
      commission_sats: conv.commission_sats,
    });
  } catch (err) {
    console.error("[Affiliate Pay] Error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
