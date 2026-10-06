#!/usr/bin/env npx tsx
/**
 * One-off backfill: resolve applications stranded on closed or filled gigs.
 *
 * Before PATCH /api/gigs/[id]/status started rejecting open applications when
 * a gig is closed or filled, those applications stayed pending/reviewing/
 * shortlisted forever. This script rejects them with metadata.reason
 * 'gig_closed' (the same shape the route now writes), so "pending" means the
 * application is still in play.
 *
 * Only closed and filled gigs: paused and draft gigs may come back. Applications
 * held for spam review are left alone.
 *
 * It sends NO email (bulk backfill). The notify_on_application_status_change
 * trigger still writes one in-app notification per application it rejects.
 *
 * Usage (env from the vault / the app env, not a .env file):
 *   npx tsx scripts/resolve-stranded-applications.ts          # dry run: counts only
 *   npx tsx scripts/resolve-stranded-applications.ts --apply  # write
 */

import { createClient } from "@supabase/supabase-js";
import { rejectOpenApplications } from "../src/lib/application-resolution";
import { OPEN_APPLICATION_STATUSES } from "../src/lib/application-status";
import { HELD_COLUMN } from "../src/lib/limits";

const APPLY = process.argv.includes("--apply");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`${APPLY ? "APPLY" : "DRY RUN"} against ${new URL(url).host}`);

  // Closed/filled gigs that still have at least one open application.
  const gigIds = new Set<string>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("applications")
      .select("gig_id, gig:gigs!inner(status)")
      .in("status", [...OPEN_APPLICATION_STATUSES])
      .in("gig.status", ["closed", "filled"])
      .is(HELD_COLUMN, null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`stranded applications query failed: ${error.message}`);
    for (const row of data ?? []) gigIds.add((row as { gig_id: string }).gig_id);
    if (!data || data.length < PAGE) break;
  }

  let total = 0;
  const byPreviousStatus: Record<string, number> = {};
  for (const gigId of gigIds) {
    const resolved = await rejectOpenApplications(supabase, gigId, "gig_closed", {
      dryRun: !APPLY,
    });
    total += resolved.length;
    for (const r of resolved) {
      byPreviousStatus[r.previous_status] = (byPreviousStatus[r.previous_status] ?? 0) + 1;
    }
  }

  console.log(`Gigs (closed/filled) with open applications: ${gigIds.size}`);
  console.log(`Applications ${APPLY ? "rejected" : "that would be rejected"}: ${total}`);
  for (const [status, count] of Object.entries(byPreviousStatus).sort()) {
    console.log(`  was ${status}: ${count}`);
  }
  if (!APPLY) console.log("Nothing written. Re-run with --apply to reject them.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
