#!/usr/bin/env npx tsx
/**
 * Daily Stats Email for ugig.net: manual run.
 *
 * The scheduled run is the app's own cron route, POST /api/cron/daily-stats
 * (x-cron-secret: $CRON_SECRET), so it always reads the production database
 * with the production keys. Do not schedule this script from another box: it
 * reads whatever NEXT_PUBLIC_SUPABASE_URL is in the environment, and a stale
 * one is exactly how the report mailed all zeros from 2026-09-26 (it pointed
 * at the deleted Supabase cloud project and turned every fetch error into 0).
 *
 * Usage (env from the vault / the app env, not a .env file):
 *   npx tsx scripts/daily-stats-email.ts                    # send to default
 *   npx tsx scripts/daily-stats-email.ts --to me@example.com
 *   npx tsx scripts/daily-stats-email.ts --dry-run          # print to stdout, don't send
 *
 * Exits non-zero, and sends nothing, if any count fails.
 */

import { createClient } from "@supabase/supabase-js";
import {
  collectDailyStats,
  renderDailyStats,
  sendDailyStatsEmail,
  DAILY_STATS_TO,
} from "../src/lib/daily-stats";

const DRY_RUN = process.argv.includes("--dry-run");
const toArg = process.argv.findIndex((a) => a === "--to");
const TO_EMAIL = toArg >= 0 && process.argv[toArg + 1] ? process.argv[toArg + 1] : DAILY_STATS_TO;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");

  console.log(`📊 Building ugig.net daily stats report from ${new URL(url).host}...`);
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const report = renderDailyStats(await collectDailyStats(supabase));

  if (DRY_RUN) {
    console.log(`\nSubject: ${report.subject}\nTo: ${TO_EMAIL}\n`);
    console.log(report.text);
    console.log("\n(dry run — email not sent)");
    return;
  }

  console.log(`📧 Sending to ${TO_EMAIL}...`);
  const id = await sendDailyStatsEmail(report, { to: TO_EMAIL });
  console.log(`✅ Sent! ID: ${id ?? "(unknown)"}`);
}

main().catch((err) => {
  console.error("❌ Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
