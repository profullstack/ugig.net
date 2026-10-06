import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runApplicationDigest } from "@/lib/application-emails";

/**
 * Cron: daily new-applications digest for gig posters.
 *
 * Each poster gets one email covering the applications received in the last
 * 24 hours that were not already emailed instantly (the first application on
 * a gig in a 24h window goes out at once; see notifyPosterOfNewApplication).
 * Honours each poster's email_new_application setting. Applications that make
 * it into a digest are stamped in metadata, so a repeat run sends nothing new.
 *
 * Schedule: once a day.
 * Auth: CRON_SECRET via x-cron-secret or Authorization: Bearer.
 * ?dry_run=1 returns what would be sent and sends nothing.
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
    const result = await runApplicationDigest(createServiceClient(), { dryRun });
    console.log(
      `[application-digest] ${dryRun ? "dry run" : "run"}: ${result.totals.applications} applications, ` +
        `${result.totals.posters} posters, sent ${result.totals.sent}, would send ${result.totals.would_send}, skipped ${result.totals.skipped}`
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[application-digest] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
