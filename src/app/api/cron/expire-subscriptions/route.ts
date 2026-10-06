import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { COINPAY_PRO_GRACE_DAYS } from "@/lib/plans";

const BATCH = 1000;

/**
 * Cron (daily): downgrade CoinPay-billed Pro plans that ran out.
 *
 * CoinPay Pro is prepaid (1 or 12 months) and nothing renews it, so once
 * current_period_end is more than COINPAY_PRO_GRACE_DAYS in the past the
 * plan goes back to free.
 *
 * Never touched:
 * - Lifetime (plan = lifetime).
 * - Stripe-managed Pro (stripe_subscription_id is set): Stripe's own
 *   webhooks renew or cancel those.
 *
 * Auth: CRON_SECRET via x-cron-secret or Authorization: Bearer.
 * ?dry_run=1 lists what would be downgraded and changes nothing.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dry_run") === "1";
  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - COINPAY_PRO_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: lapsed, error } = await supabase
    .from("subscriptions")
    .select("id, user_id, current_period_end")
    .eq("plan", "pro")
    .is("stripe_subscription_id", null)
    .lt("current_period_end", cutoff)
    .limit(BATCH);

  if (error) {
    console.error("[expire-subscriptions] query failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = lapsed ?? [];
  if (dryRun) {
    return NextResponse.json({ dry_run: true, would_downgrade: rows.map((r) => r.user_id) });
  }

  let downgraded = 0;
  const failed: string[] = [];
  for (const row of rows) {
    const now = new Date().toISOString();
    // Re-check the same conditions in the WHERE clause so a renewal or a
    // Stripe checkout that landed meanwhile is not undone.
    const { data: updated, error: updateError } = await supabase
      .from("subscriptions")
      .update({ plan: "free", status: "canceled", cancel_at_period_end: false, updated_at: now })
      .eq("id", row.id)
      .eq("plan", "pro")
      .is("stripe_subscription_id", null)
      .lt("current_period_end", cutoff)
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.error("[expire-subscriptions] update failed:", row.id, updateError);
      failed.push(row.id);
      continue;
    }
    if (!updated) continue;
    downgraded += 1;

    await supabase.from("notifications").insert({
      user_id: row.user_id,
      type: "payment_received",
      title: "Your Pro plan has ended",
      body: "Your crypto-paid Pro period is over and your account is back on Free. Renew any time from Subscription.",
      data: { reason: "coinpay_pro_expired", current_period_end: row.current_period_end },
    });
  }

  console.log(`[expire-subscriptions] lapsed ${rows.length}, downgraded ${downgraded}`);
  return NextResponse.json({ lapsed: rows.length, downgraded, failed });
}
