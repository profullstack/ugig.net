import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autoReleasePaypalOrders } from "@/lib/orders/paypal-auto-release";

/**
 * POST /api/cron/release-paypal-orders — 14-day auto-release for PayPal Buy now
 * orders (crypto orders get this from CoinPay escrow), and expiry of abandoned
 * PayPal checkouts. Hourly via `ugig-cron release-paypal-orders`.
 */
export async function POST(request: NextRequest) {
  const cronSecret =
    request.headers.get("x-cron-secret") ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || !cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dry_run") === "1";
  try {
    const result = await autoReleasePaypalOrders(createServiceClient() as never, new Date(), { dryRun });
    console.log(
      `[release-paypal-orders] due ${result.due}, released ${result.released}, expired ${result.expired}${dryRun ? " (dry run)" : ""}`
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[release-paypal-orders] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
