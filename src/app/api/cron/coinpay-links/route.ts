import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { sweepCoinpayLinks } from "@/lib/coinpay-link-sweep";

/**
 * POST /api/cron/coinpay-links — moves CoinPay links onto stored wallet addresses (deleting old tokens) and
 * tells a seller once when theirs has died. Daily via `ugig-cron coinpay-links`.
 * `?dry_run=1` counts (incl. legacyRemaining) without migrating, writing or sending.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dryRun = request.nextUrl.searchParams.get("dry_run") === "1";
  try {
    const result = await sweepCoinpayLinks(createServiceClient() as never, { dryRun });
    console.log("[coinpay-links]", JSON.stringify(result));
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[coinpay-links] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
