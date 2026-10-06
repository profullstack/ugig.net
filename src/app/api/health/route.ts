import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" };

/**
 * GET /api/health
 * Public liveness + database check for status.profullstack.com. One cheap
 * HEAD select against profiles, capped at 3s. Never returns error details.
 */
export async function GET() {
  try {
    const { error } = await createServiceClient()
      .from("profiles")
      .select("id", { head: true })
      .limit(1)
      .abortSignal(AbortSignal.timeout(3000));
    if (error) throw error;
    return NextResponse.json({ status: "ok", db: "ok" }, { headers: HEADERS });
  } catch {
    return NextResponse.json(
      { status: "error", db: "down" },
      { status: 503, headers: HEADERS },
    );
  }
}
