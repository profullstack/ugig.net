import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isAuthorizedCron } from "@/lib/cron-auth";

/** Without an expires_at from CoinPay, a pending checkout expires after this long. */
const DEFAULT_PAYMENT_TTL_MS = 24 * 60 * 60 * 1000;

const BATCH = 1000;

/**
 * Cron (hourly): mark CoinPay checkout payments (`payments`) that are still
 * `pending` past their CoinPay expiry (metadata.expires_at, or 24h after
 * creation when absent) as `expired`. CoinPay does not always send
 * payment.expired, which left rows pending forever.
 *
 * Only pending rows change, and the update re-checks status = pending, so a
 * payment confirmed in the meantime is never touched. A payment that arrives
 * after this still activates (the webhook settles from expired too).
 *
 * Auth: CRON_SECRET via x-cron-secret or Authorization: Bearer.
 * ?dry_run=1 lists what would expire and changes nothing.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dry_run") === "1";
  const supabase = createServiceClient();
  const now = Date.now();

  const { data: pending, error } = await supabase
    .from("payments")
    .select("id, created_at, metadata")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    console.error("[expire-payments] query failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = (pending ?? []).filter((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const expiresAt = typeof meta.expires_at === "string" ? Date.parse(meta.expires_at) : NaN;
    const deadline = Number.isFinite(expiresAt)
      ? expiresAt
      : Date.parse(row.created_at as string) + DEFAULT_PAYMENT_TTL_MS;
    return Number.isFinite(deadline) && deadline < now;
  });

  if (dryRun) {
    return NextResponse.json({ dry_run: true, checked: pending?.length ?? 0, would_expire: due.map((r) => r.id) });
  }

  let expired = 0;
  const failed: string[] = [];
  for (const row of due) {
    const { error: updateError } = await supabase
      .from("payments")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "pending");
    if (updateError) {
      console.error("[expire-payments] update failed:", row.id, updateError);
      failed.push(row.id);
    } else {
      expired += 1;
    }
  }

  console.log(`[expire-payments] checked ${pending?.length ?? 0}, expired ${expired}`);
  return NextResponse.json({ checked: pending?.length ?? 0, expired, failed });
}
