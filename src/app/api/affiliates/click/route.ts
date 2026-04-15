import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { recordClick } from "@/lib/affiliates/tracking";
import { randomUUID } from "crypto";

/**
 * GET /api/affiliates/click?ugig_ref=CODE - Record an affiliate click and redirect
 * This is the tracking endpoint — affiliate links hit this, then redirect to the offer.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ref = searchParams.get("ugig_ref");

    if (!ref) {
      return NextResponse.redirect(new URL("/affiliates", request.url));
    }

    const admin = createServiceClient();

    // Look up the offer from the tracking code
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: app } = await (admin as any)
      .from("affiliate_applications")
      .select(`
        offer_id,
        affiliate_offers!inner(product_url, slug, listing_id, skill_listings(slug))
      `)
      .eq("tracking_code", ref)
      .eq("status", "approved")
      .single();

    if (!app) {
      return NextResponse.redirect(new URL("/affiliates", request.url));
    }

    // Read or generate a persistent visitor ID from cookie
    const existingVisitorId = request.cookies.get("ugig_visitor")?.value;
    const visitorId = existingVisitorId || randomUUID();

    // Record the click
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "unknown";

    await recordClick(admin, {
      trackingCode: ref,
      visitorId,
      ip,
      userAgent: request.headers.get("user-agent") || undefined,
      referer: request.headers.get("referer") || undefined,
      landedUrl: request.url,
    });

    // Determine redirect URL
    const offer = app.affiliate_offers;
    let redirectUrl: string;

    if (offer.product_url) {
      redirectUrl = offer.product_url;
    } else if (offer.listing_id && offer.skill_listings?.slug) {
      redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net"}/skills/${offer.skill_listings.slug}`;
    } else {
      redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net"}/affiliates/${offer.slug}`;
    }

    // Add ref param to destination for client-side cookie tracking
    const dest = new URL(redirectUrl);
    dest.searchParams.set("ugig_ref", ref);

    // Set affiliate tracking cookie (30 days default, offer can override)
    const response = NextResponse.redirect(dest);
    response.cookies.set("aff_ref", ref, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
    });

    // Persist visitor ID cookie (1 year) so repeat clicks can be deduplicated
    if (!existingVisitorId) {
      response.cookies.set("ugig_visitor", visitorId, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 365 * 24 * 60 * 60, // 1 year
        path: "/",
      });
    }

    return response;
  } catch (err) {
    console.error("Affiliate click error:", err);
    return NextResponse.redirect(new URL("/affiliates", request.url));
  }
}
