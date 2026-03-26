import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/gigs/[id]/bids - Alias for /api/gigs/[id]/applications (#43)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(`/api/gigs/${encodeURIComponent(id)}/applications`, request.url);
  // Forward query params
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    url.searchParams.set(key, value);
  }

  const forwardHeaders: Record<string, string> = {};
  const cookie = request.headers.get("cookie");
  const auth = request.headers.get("authorization");
  if (cookie) forwardHeaders["cookie"] = cookie;
  if (auth) forwardHeaders["authorization"] = auth;

  try {
    const res = await fetch(url.toString(), { headers: forwardHeaders });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
