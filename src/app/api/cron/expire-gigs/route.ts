import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { expireGigs } from "@/lib/gigs/expire-gigs";

/**
 * Cron: pause active gigs past their expires_at and email each poster once
 * (gigExpiredEmail, with a "Renew for 30 days" link; 60 for for_hire ads).
 * Recommended schedule: hourly. Each run handles up to EXPIRE_GIGS_BATCH gigs.
 *
 * Auth: CRON_SECRET via x-cron-secret or Authorization: Bearer.
 * ?dry_run=1 lists the gigs it would pause and changes nothing.
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
    const result = await expireGigs(createServiceClient(), { dryRun });
    console.log(
      `[expire-gigs] found ${result.found}, paused ${result.paused}, emailed ${result.emailed}, skipped ${result.email_skipped}, failed ${result.email_failed}${dryRun ? " (dry run)" : ""}`
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[expire-gigs] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
