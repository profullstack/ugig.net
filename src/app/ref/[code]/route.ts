import { NextRequest, NextResponse } from "next/server";
import { buildAffiliateTrackingUrl, getAffiliateBaseUrl } from "@/lib/affiliates/tracking-url";

/**
 * GET /ref/[code] - Short affiliate tracking link
 * Redirects to /api/affiliates/click?ugig_ref=CODE
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  return NextResponse.redirect(
    buildAffiliateTrackingUrl(getAffiliateBaseUrl(request.url), code)
  );
}
