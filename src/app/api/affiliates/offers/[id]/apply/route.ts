import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;
import { generateTrackingCode } from "@/lib/affiliates/tracking";


/**
 * POST /api/affiliates/offers/[id]/apply - Apply to become an affiliate for an offer
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

    const rl = checkRateLimit(getRateLimitIdentifier(request, auth.user.id), "write");
    if (!rl.allowed) return rateLimitExceeded(rl);

    const admin = createServiceClient();

    // Fetch offer
    const { data: offer } = await (admin as AnySupabase)
      .from("affiliate_offers")
      .select("id, seller_id, status, slug")
      .eq("id", id)
      .single();

    if (!offer || offer.status !== "active") {
      return NextResponse.json({ error: "Offer not found or not active" }, { status: 404 });
    }

    // Can't be affiliate for your own offer
    if (offer.seller_id === auth.user.id) {
      return NextResponse.json({ error: "Cannot promote your own offer" }, { status: 400 });
    }

    // Check if already applied
    const { data: existing } = await (admin as AnySupabase)
      .from("affiliate_applications")
      .select("id, status")
      .eq("offer_id", id)
      .eq("affiliate_id", auth.user.id)
      .single();

    if (existing) {
      return NextResponse.json({
        error: `Already ${existing.status}`,
        application: existing,
      }, { status: 409 });
    }

    // Get affiliate's username for tracking code
    const { data: profile } = await admin
      .from("profiles")
      .select("username")
      .eq("id", auth.user.id)
      .single();

    const trackingCode = generateTrackingCode(
      profile?.username || auth.user.id.slice(0, 8),
      offer.slug
    );

    const body = await request.json().catch(() => ({}));

    // Auto-approve for now (sellers can change to manual later)
    const { data: application, error } = await (admin as AnySupabase)
      .from("affiliate_applications")
      .insert({
        offer_id: id,
        affiliate_id: auth.user.id,
        tracking_code: trackingCode,
        status: "approved",
        approved_at: new Date().toISOString(),
        note: body.note || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Already applied" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Increment offer affiliate count
    try {
      const { data: offerData } = await (admin as AnySupabase)
        .from("affiliate_offers")
        .select("total_affiliates")
        .eq("id", id)
        .single();
      if (offerData) {
        await (admin as AnySupabase)
          .from("affiliate_offers")
          .update({
            total_affiliates: (offerData.total_affiliates || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
      }
    } catch {
      console.warn("Failed to increment affiliate count");
    }

    // Notify seller
    await (admin as AnySupabase)
      .from("notifications")
      .insert({
        user_id: offer.seller_id,
        type: "affiliate_application",
        title: "New affiliate joined! 🤝",
        body: `${profile?.username || "Someone"} is now promoting your offer`,
        data: { offer_id: id, application_id: application.id },
      });

    return NextResponse.json({
      application,
      tracking_code: trackingCode,
      tracking_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net"}/ref/${trackingCode}`,
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
