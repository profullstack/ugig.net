import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { collectDailyStats, renderDailyStats, sendDailyStatsEmail } from "@/lib/daily-stats";

/**
 * Cron: the ugig.net daily stats email (08:00 UTC, to anthony@profullstack.com).
 *
 * Runs inside the app so it reads the same database and keys the site does.
 * It used to be scripts/daily-stats-email.ts run from a droplet with its own
 * .env, which kept pointing at the deleted Supabase cloud project after the
 * move to dev2 and mailed all zeros from 2026-09-26.
 *
 * Auth: CRON_SECRET via x-cron-secret or Authorization: Bearer.
 * ?dry_run=1 returns the counts as JSON and sends nothing.
 * Any query failure is a 500 and NO email goes out.
 */
export async function POST(request: NextRequest) {
  const cronSecret =
    request.headers.get("x-cron-secret") ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || !cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dry_run") === "1";

  let stats;
  try {
    stats = await collectDailyStats(createServiceClient());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[daily-stats] not sent:", message);
    return NextResponse.json({ error: message, sent: false }, { status: 500 });
  }

  const report = renderDailyStats(stats);
  if (dryRun) {
    return NextResponse.json({ sent: false, dry_run: true, subject: report.subject, stats });
  }

  try {
    const id = await sendDailyStatsEmail(report);
    console.log(`[daily-stats] sent ${report.subject} (${id ?? "no id"})`);
    return NextResponse.json({ sent: true, id, subject: report.subject });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[daily-stats] send failed:", message);
    return NextResponse.json({ error: message, sent: false }, { status: 502 });
  }
}
