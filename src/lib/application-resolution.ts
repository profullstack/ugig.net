import type { SupabaseClient } from "@supabase/supabase-js";
import { OPEN_APPLICATION_STATUSES } from "@/lib/application-status";
import { HELD_COLUMN } from "@/lib/limits";

type Client = SupabaseClient<any, "public", any>;

export type ResolutionReason = "gig_closed" | "gig_filled";

export interface ResolvedApplication {
  id: string;
  applicant_id: string;
  previous_status: string;
}

/**
 * Reject every application on a gig that is still pending, reviewing or
 * shortlisted, recording why in metadata.reason. The
 * notify_on_application_status_change trigger then gives each applicant one
 * in-app notification. Existing metadata keys are preserved.
 *
 * Applications held for spam review are left alone: the poster never saw
 * them and the applicant should not be notified about them.
 *
 * Each row is updated on the condition that it is still open, so an
 * application the poster accepts in the meantime is left alone.
 */
export async function rejectOpenApplications(
  client: Client,
  gigId: string,
  reason: ResolutionReason,
  { dryRun = false, now = new Date() }: { dryRun?: boolean; now?: Date } = {}
): Promise<ResolvedApplication[]> {
  const { data, error } = await client
    .from("applications")
    .select("id, applicant_id, status, metadata")
    .eq("gig_id", gigId)
    .in("status", [...OPEN_APPLICATION_STATUSES])
    // Applications held for spam review stay with the reviewers.
    .is(HELD_COLUMN, null);

  if (error) throw new Error(`open applications query failed: ${error.message}`);

  const open = (data ?? []) as {
    id: string;
    applicant_id: string;
    status: string;
    metadata: unknown;
  }[];
  if (dryRun || open.length === 0) {
    return open.map((a) => ({ id: a.id, applicant_id: a.applicant_id, previous_status: a.status }));
  }

  const resolved: ResolvedApplication[] = [];
  const stamp = now.toISOString();
  for (let i = 0; i < open.length; i += 10) {
    const batch = open.slice(i, i + 10);
    const results = await Promise.all(
      batch.map(async (app) => {
        const metadata =
          app.metadata && typeof app.metadata === "object" && !Array.isArray(app.metadata)
            ? (app.metadata as Record<string, unknown>)
            : {};
        const { data: updated, error: updateError } = await client
          .from("applications")
          .update({
            status: "rejected",
            updated_at: stamp,
            metadata: { ...metadata, reason, resolved_at: stamp },
          })
          .eq("id", app.id)
          .in("status", [...OPEN_APPLICATION_STATUSES])
          .select("id");
        if (updateError || !updated || (updated as unknown[]).length === 0) return null;
        return { id: app.id, applicant_id: app.applicant_id, previous_status: app.status };
      })
    );
    for (const r of results) if (r) resolved.push(r);
  }
  return resolved;
}
