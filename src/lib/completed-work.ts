import type { SupabaseClient } from "@supabase/supabase-js";
import { HIRED_APPLICATION_STATUSES } from "@/lib/application-status";

/**
 * "Completed work" for a worker: a hired application (any status in
 * HIRED_APPLICATION_STATUSES) that has at least one PAID gig invoice, OR that
 * is on a gig the poster marked `filled`.
 *
 * Auto-verification and the profile "completed gigs" list both use this, so
 * they never disagree. Before, completed meant "hired on a filled gig" only,
 * and almost nothing fills gigs, while 267 paid invoices (real, finished
 * jobs) counted for nothing.
 */

export interface CompletedApplication {
  id: string;
  gig_id: string;
  updated_at: string | null;
  status: string;
  gig: {
    id: string;
    title: string | null;
    status: string | null;
    budget_type: string | null;
    budget_min: number | null;
    poster_id: string | null;
    poster: { username: string | null; full_name: string | null } | null;
  } | null;
}

/** Pure rule, exported for tests: which hired applications count as completed. */
export function filterCompletedApplications<
  T extends { id: string; gig?: { status?: string | null } | null },
>(applications: T[], paidApplicationIds: Set<string>): T[] {
  return applications.filter(
    (app) => app.gig?.status === "filled" || paidApplicationIds.has(app.id)
  );
}

/**
 * Fetch the user's completed applications, newest first.
 *
 * The client must be able to read the user's applications and their gig
 * invoices: the user's own session (verification) or the service client
 * (public profile page, where RLS would hide them from other viewers).
 */
export async function getCompletedApplications(
  client: SupabaseClient<any>,
  userId: string
): Promise<CompletedApplication[]> {
  const [{ data: apps }, { data: paidInvoices }] = await Promise.all([
    client
      .from("applications")
      .select(
        "id, gig_id, updated_at, status, gig:gigs!gig_id(id, title, status, budget_type, budget_min, poster_id, poster:profiles!poster_id(username, full_name))"
      )
      .eq("applicant_id", userId)
      .in("status", HIRED_APPLICATION_STATUSES as unknown as string[])
      .order("updated_at", { ascending: false }),
    client
      .from("gig_invoices")
      .select("application_id")
      .eq("worker_id", userId)
      .eq("status", "paid"),
  ]);

  const paidIds = new Set<string>(
    ((paidInvoices || []) as { application_id: string | null }[])
      .map((i) => i.application_id)
      .filter((id): id is string => !!id)
  );

  const normalized = ((apps || []) as unknown[]).map((raw) => {
    const app = raw as CompletedApplication & {
      gig: CompletedApplication["gig"] | CompletedApplication["gig"][];
    };
    const gig = Array.isArray(app.gig) ? app.gig[0] ?? null : app.gig;
    const poster = gig && Array.isArray(gig.poster) ? gig.poster[0] ?? null : gig?.poster ?? null;
    return { ...app, gig: gig ? { ...gig, poster } : null } as CompletedApplication;
  });

  return filterCompletedApplications(normalized, paidIds);
}
