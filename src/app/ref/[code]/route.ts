import { getAppUrl } from "@/lib/app-url";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /ref/[code] - Short affiliate tracking link
 * Redirects to /api/affiliates/click?ugig_ref=CODE
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const baseUrl = getAppUrl(request);
  return NextResponse.redirect(`${baseUrl}/api/affiliates/click?ugig_ref=${encodeURIComponent(code)}`);
}
