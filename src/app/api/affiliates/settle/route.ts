import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { settleCommissions } from "@/lib/affiliates/commission";

/**
 * POST /api/affiliates/settle - Settle pending commissions (cron or admin)
 * Protected by CRON_SECRET header.
 */
export async function POST(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");

    if (!cronSecret) {
      console.error("[affiliate-settle] CRON_SECRET not set - rejecting request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createServiceClient();
    const result = await settleCommissions(admin, { limit: 100 });

    console.log(
      `[affiliate-settle] settled=${result.settled} failed=${result.failed} total_sats=${result.total_sats}`
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error("Settlement error:", err);
    return NextResponse.json({ error: "Settlement failed" }, { status: 500 });
  }
}
