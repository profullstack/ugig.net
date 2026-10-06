import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sendEmail,
  applicationStatusEmail,
  newApplicationEmail,
  applicationDigestEmail,
  type ApplicationDigestGig,
} from "@/lib/email";
import { isEmailNotificationEnabled } from "@/lib/notification-settings";
import { emailOptOutIds } from "@/lib/broadcast/audiences";
import { createServiceClient } from "@/lib/supabase/service";
import { HELD_COLUMN } from "@/lib/limits";

type Client = SupabaseClient<any, "public", any>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Application statuses that email the applicant (when the setting is on). */
export const STATUSES_EMAILED_TO_APPLICANT = ["accepted", "rejected", "shortlisted"] as const;

export function statusEmailsApplicant(status: string): boolean {
  return (STATUSES_EMAILED_TO_APPLICANT as readonly string[]).includes(status);
}

/**
 * Key in applications.metadata recording that the poster has already been
 * emailed about this application ("instant" or "digest"), so the daily digest
 * never repeats it.
 */
export const POSTER_EMAILED_KEY = "poster_emailed";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function getAuthEmail(svc: Client, userId: string): Promise<string | null> {
  try {
    const { data } = await svc.auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch {
    return null;
  }
}

async function profileNames(svc: Client, ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await svc
      .from("profiles")
      .select("id, full_name, username")
      .in("id", ids.slice(i, i + 500));
    for (const row of (data ?? []) as {
      id: string;
      full_name: string | null;
      username: string | null;
    }[]) {
      const name = row.full_name || row.username;
      if (name) names.set(row.id, name);
    }
  }
  return names;
}

// ── Applicant status emails ──────────────────────────────────────────

export interface ApplicantStatusChange {
  applicationId: string;
  applicantId: string;
  gigId: string;
  gigTitle: string;
  posterName: string;
  status: string;
}

/**
 * Email applicants whose application became accepted, rejected or
 * shortlisted, honouring each applicant's `email_application_status` setting.
 * Other statuses are ignored. The in-app notification is the DB trigger's job,
 * not this function's.
 */
export async function emailApplicantsAboutStatus(
  svc: Client,
  changes: ApplicantStatusChange[]
): Promise<{ sent: number; skipped: number }> {
  const eligible = changes.filter((c) => statusEmailsApplicant(c.status));
  if (eligible.length === 0) return { sent: 0, skipped: changes.length };

  const applicantIds = [...new Set(eligible.map((c) => c.applicantId))];
  const optedOut = await emailOptOutIds(svc, applicantIds, "email_application_status");
  const names = await profileNames(svc, applicantIds);

  let sent = 0;
  for (const change of eligible) {
    if (optedOut.has(change.applicantId)) continue;
    const to = await getAuthEmail(svc, change.applicantId);
    if (!to) continue;

    const content = applicationStatusEmail({
      applicantName: names.get(change.applicantId) || "there",
      gigTitle: change.gigTitle,
      gigId: change.gigId,
      status: change.status,
      posterName: change.posterName,
    });
    const result = await sendEmail({
      to,
      ...content,
      unsubscribe: { userId: change.applicantId, setting: "email_application_status" },
    });
    if (result.success) sent++;
  }

  return { sent, skipped: changes.length - sent };
}

/**
 * Fire-and-forget wrapper for routes: never throws, never delays the response.
 */
export function emailApplicantsAboutStatusInBackground(changes: ApplicantStatusChange[]): void {
  if (!changes.some((c) => statusEmailsApplicant(c.status))) return;
  void (async () => {
    try {
      await emailApplicantsAboutStatus(createServiceClient(), changes);
    } catch (err) {
      console.error("[application-emails] status email failed:", err);
    }
  })();
}

// ── New-application emails to posters ────────────────────────────────

export interface NewApplicationNotice {
  gigId: string;
  gigTitle: string;
  posterId: string;
  posterName: string;
  applicationId: string;
  applicationMetadata?: unknown;
  applicantName: string;
  coverLetter: string;
}

export type NewApplicationEmailOutcome = "instant" | "digest" | "disabled" | "no_email" | "failed";

/**
 * Email the poster about a new application, but only instantly for the first
 * application on the gig in the last 24 hours. Every other application waits
 * for the daily digest (POST /api/cron/application-digest). Honours the
 * poster's `email_new_application` setting.
 */
export async function notifyPosterOfNewApplication(
  svc: Client,
  notice: NewApplicationNotice,
  now: Date = new Date()
): Promise<NewApplicationEmailOutcome> {
  const enabled = await isEmailNotificationEnabled(svc, notice.posterId, "email_new_application");
  if (!enabled) return "disabled";

  const since = new Date(now.getTime() - DAY_MS).toISOString();
  const { count, error } = await svc
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("gig_id", notice.gigId)
    .neq("id", notice.applicationId)
    .gte("created_at", since)
    // Held applications were never shown to the poster, so they don't count.
    .is(HELD_COLUMN, null);

  // On a failed count, fall back to an instant email rather than risk the
  // poster hearing nothing at all.
  if (!error && (count ?? 0) > 0) return "digest";

  const to = await getAuthEmail(svc, notice.posterId);
  if (!to) return "no_email";

  const content = newApplicationEmail({
    posterName: notice.posterName,
    applicantName: notice.applicantName,
    gigTitle: notice.gigTitle,
    gigId: notice.gigId,
    applicationId: notice.applicationId,
    coverLetterPreview: notice.coverLetter,
  });
  const result = await sendEmail({
    to,
    ...content,
    unsubscribe: { userId: notice.posterId, setting: "email_new_application" },
  });
  if (!result.success) return "failed";

  await svc
    .from("applications")
    .update({
      metadata: {
        ...asObject(notice.applicationMetadata),
        [POSTER_EMAILED_KEY]: "instant",
        poster_emailed_at: now.toISOString(),
      },
    })
    .eq("id", notice.applicationId);

  return "instant";
}

export function notifyPosterOfNewApplicationInBackground(notice: NewApplicationNotice): void {
  void (async () => {
    try {
      await notifyPosterOfNewApplication(createServiceClient(), notice);
    } catch (err) {
      console.error("[application-emails] new application email failed:", err);
    }
  })();
}

// ── Daily digest ─────────────────────────────────────────────────────

export interface DigestPosterResult {
  poster_id: string;
  gigs: number;
  applications: number;
  outcome: "sent" | "would_send" | "disabled" | "no_email" | "failed";
}

export interface DigestResult {
  dry_run: boolean;
  window_start: string;
  window_end: string;
  posters: DigestPosterResult[];
  totals: {
    applications: number;
    posters: number;
    sent: number;
    would_send: number;
    skipped: number;
  };
}

interface DigestRow {
  id: string;
  gig_id: string;
  applicant_id: string;
  cover_letter: string | null;
  metadata: unknown;
  created_at: string;
  gig: { id: string; title: string | null; poster_id: string } | { id: string; title: string | null; poster_id: string }[] | null;
}

/**
 * Build and (unless dryRun) send one digest per poster covering applications
 * received in the 24 hours before `now` that were not already emailed.
 * Sent applications are stamped in metadata so a second run sends nothing.
 */
export async function runApplicationDigest(
  svc: Client,
  { dryRun = false, now = new Date() }: { dryRun?: boolean; now?: Date } = {}
): Promise<DigestResult> {
  const windowStart = new Date(now.getTime() - DAY_MS).toISOString();
  const windowEnd = now.toISOString();

  const rows: DigestRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await svc
      .from("applications")
      .select("id, gig_id, applicant_id, cover_letter, metadata, created_at, gig:gigs(id, title, poster_id)")
      .gte("created_at", windowStart)
      .lt("created_at", windowEnd)
      .neq("status", "withdrawn")
      .is(HELD_COLUMN, null)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`applications query failed: ${error.message}`);
    const page = (data ?? []) as DigestRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  // poster -> gig -> rows
  const byPoster = new Map<string, Map<string, { title: string; rows: DigestRow[] }>>();
  for (const row of rows) {
    const meta = asObject(row.metadata);
    // Already emailed, or held for spam review (the poster never hears of those).
    if (meta[POSTER_EMAILED_KEY] || meta.held) continue;
    const gig = Array.isArray(row.gig) ? row.gig[0] : row.gig;
    if (!gig?.poster_id) continue;
    let gigs = byPoster.get(gig.poster_id);
    if (!gigs) byPoster.set(gig.poster_id, (gigs = new Map()));
    let entry = gigs.get(gig.id);
    if (!entry) gigs.set(gig.id, (entry = { title: gig.title || "Your gig", rows: [] }));
    entry.rows.push(row);
  }

  const posterIds = [...byPoster.keys()];
  const optedOut = posterIds.length
    ? await emailOptOutIds(svc, posterIds, "email_new_application")
    : new Set<string>();
  const applicantIds = [
    ...new Set([...byPoster.values()].flatMap((g) => [...g.values()].flatMap((e) => e.rows.map((r) => r.applicant_id)))),
  ];
  const names = await profileNames(svc, [...new Set([...posterIds, ...applicantIds])]);

  const result: DigestResult = {
    dry_run: dryRun,
    window_start: windowStart,
    window_end: windowEnd,
    posters: [],
    totals: { applications: 0, posters: posterIds.length, sent: 0, would_send: 0, skipped: 0 },
  };

  for (const [posterId, gigs] of byPoster) {
    const gigList = [...gigs.entries()];
    const appRows = gigList.flatMap(([, e]) => e.rows);
    result.totals.applications += appRows.length;
    const summary = { poster_id: posterId, gigs: gigList.length, applications: appRows.length };

    if (optedOut.has(posterId)) {
      result.posters.push({ ...summary, outcome: "disabled" });
      result.totals.skipped++;
      continue;
    }

    const to = await getAuthEmail(svc, posterId);
    if (!to) {
      result.posters.push({ ...summary, outcome: "no_email" });
      result.totals.skipped++;
      continue;
    }

    if (dryRun) {
      result.posters.push({ ...summary, outcome: "would_send" });
      result.totals.would_send++;
      continue;
    }

    const digestGigs: ApplicationDigestGig[] = gigList.map(([gigId, e]) => ({
      gigId,
      gigTitle: e.title,
      applicants: e.rows.map((r) => ({
        name: names.get(r.applicant_id) || "A candidate",
        coverLetterPreview: r.cover_letter || "",
      })),
    }));

    const content = applicationDigestEmail({
      posterName: names.get(posterId) || "there",
      gigs: digestGigs,
    });
    const sendResult = await sendEmail({
      to,
      ...content,
      unsubscribe: { userId: posterId, setting: "email_new_application" },
    });
    if (!sendResult.success) {
      result.posters.push({ ...summary, outcome: "failed" });
      result.totals.skipped++;
      continue;
    }

    const stampedAt = now.toISOString();
    for (let i = 0; i < appRows.length; i += 10) {
      await Promise.all(
        appRows.slice(i, i + 10).map((r) =>
          svc
            .from("applications")
            .update({
              metadata: {
                ...asObject(r.metadata),
                [POSTER_EMAILED_KEY]: "digest",
                poster_emailed_at: stampedAt,
              },
            })
            .eq("id", r.id)
        )
      );
    }

    result.posters.push({ ...summary, outcome: "sent" });
    result.totals.sent++;
  }

  return result;
}
