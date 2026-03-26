import { NextRequest, NextResponse } from "next/server";
import { safeParseBody } from "@/lib/sanitize";

/**
 * POST /api/affiliates/apply - Wrapper that proxies to /api/affiliates/offers/[id]/apply (#37)
 * Reads offer_id from request body and forwards to the correct route.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await safeParseBody<{ offer_id?: string }>(request);
    if (!body || !body.offer_id) {
      return NextResponse.json(
        { error: "offer_id is required in request body" },
        { status: 400 }
      );
    }

    const offerId = body.offer_id;
    const url = new URL(`/api/affiliates/offers/${encodeURIComponent(offerId)}/apply`, request.url);

    // Forward auth headers
    const forwardHeaders: Record<string, string> = {};
    const cookie = request.headers.get("cookie");
    const auth = request.headers.get("authorization");
    if (cookie) forwardHeaders["cookie"] = cookie;
    if (auth) forwardHeaders["authorization"] = auth;
    forwardHeaders["content-type"] = "application/json";

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: forwardHeaders,
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({ error: "Upstream error" }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
