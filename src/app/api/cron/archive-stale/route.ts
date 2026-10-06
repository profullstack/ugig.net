import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Cron: archive stale and spam content (never deletes, never emails).
 *
 * Calls archive_stale_content() (migration 20261006190000), which in one
 * transaction archives
 * - gigs (jobs and for-hire ads) with no activity for 30 days, drafts
 *   included, and every non-filled gig from an is_spam poster;
 * - applications still pending after 30 days, open applications on archived,
 *   closed or filled gigs, and open applications from is_spam applicants.
 * Filled gigs, hired applications and anything with an invoice or escrow are
 * left alone. Owners reactivate an archived gig with POST /api/gigs/[id]/renew.
 * Recommended schedule: daily.
 *
 * Auth: CRON_SECRET via x-cron-secret or Authorization: Bearer.
 * ?dry_run=1 returns the counts and changes nothing.
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
    const { data, error } = await (createServiceClient() as any).rpc("archive_stale_content", {
      p_dry_run: dryRun,
    });
    if (error) throw new Error(error.message);
    console.log(`[archive-stale] ${JSON.stringify(data)}`);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[archive-stale] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
