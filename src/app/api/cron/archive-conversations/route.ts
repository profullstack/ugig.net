import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Cron: auto-archive conversations with no messages in the last 7 days.
 *
 * Auth: requires CRON_SECRET header to prevent unauthorized calls.
 */
export async function POST(request: NextRequest) {
  try {
    const cronSecret =
      request.headers.get("x-cron-secret") ||
      request.headers.get("authorization")?.replace("Bearer ", "");
    if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    // Find conversations that are not archived and have last_message_at older than 7 days
    const { data: candidates, error: fetchError } = await supabase
      .from("conversations")
      .select("id")
      .is("archived_at", null)
      .lt("last_message_at", sevenDaysAgo);

    if (fetchError) {
      console.error("[archive-conversations] Query error:", fetchError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ archived: 0, checked: 0 });
    }

    // Double-check each candidate has no recent messages (in case last_message_at is stale)
    const toArchive: string[] = [];

    for (const conv of candidates) {
      const { count } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("conversation_id", conv.id)
        .gte("created_at", sevenDaysAgo);

      if ((count ?? 0) === 0) {
        toArchive.push(conv.id);
      }
    }

    if (toArchive.length === 0) {
      return NextResponse.json({
        archived: 0,
        checked: candidates.length,
      });
    }

    // Archive in batch
    const { error: updateError } = await supabase
      .from("conversations")
      .update({ archived_at: new Date().toISOString() })
      .in("id", toArchive);

    if (updateError) {
      console.error("[archive-conversations] Update error:", updateError);
      return NextResponse.json({ error: "Failed to archive" }, { status: 500 });
    }

    console.log(
      `[archive-conversations] Archived ${toArchive.length} of ${candidates.length} candidates`
    );

    return NextResponse.json({
      archived: toArchive.length,
      checked: candidates.length,
    });
  } catch (err) {
    console.error("[archive-conversations] Unexpected error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
