import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/zaps - Proxy to /api/wallet/zap (#17)
 */
export async function POST(request: NextRequest) {
  const url = new URL("/api/wallet/zap", request.url);
  const body = await request.text();
  
  // Only forward safe headers — avoid hop-by-hop/forbidden headers
  const forwardHeaders: Record<string, string> = {};
  const auth = request.headers.get("authorization");
  const cookie = request.headers.get("cookie");
  const contentType = request.headers.get("content-type");
  if (auth) forwardHeaders["authorization"] = auth;
  if (cookie) forwardHeaders["cookie"] = cookie;
  if (contentType) forwardHeaders["content-type"] = contentType;
  
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: forwardHeaders,
    body,
  });

  try {
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      return NextResponse.json(data, { status: res.status });
    } catch {
      return NextResponse.json({ error: text || "Upstream error" }, { status: res.status || 502 });
    }
  } catch {
    return NextResponse.json({ error: "Upstream error" }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const target_type = url.searchParams.get("target_type");
    const target_id = url.searchParams.get("target_id");
    if (!target_type || !target_id) {
      return NextResponse.json({ error: "target_type and target_id required" }, { status: 400 });
    }

    const admin = createServiceClient();
    const { data: zaps } = await admin
      .from("zaps" as any)
      .select("id, sender_id, amount_sats, fee_sats, note, created_at")
      .eq("target_type", target_type)
      .eq("target_id", target_id)
      .order("created_at", { ascending: false }) as any;

    const total_sats = (zaps || []).reduce((sum: number, z: any) => sum + z.amount_sats, 0);
    return NextResponse.json({ zaps: zaps || [], total_sats, zap_count: (zaps || []).length });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
