import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Posting and application limits (PRD 01 req 3, PRD 02 req 5, PRD 03 reqs 2-3).
 *
 * Every count comes from the database, never from process memory, so the
 * limits hold across app instances and restarts. The in-memory per-minute
 * limiter in src/lib/rate-limit.ts still runs in front of these.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// ── Gig expiry ────────────────────────────────────────────────────────

/** A hiring gig is listed for this many days after it becomes active. */
export const HIRING_GIG_EXPIRY_DAYS = 30;
/** A for_hire ad is listed for this many days after it becomes active. */
export const FOR_HIRE_AD_EXPIRY_DAYS = 60;

// ── For-hire ad caps (one account posted 448 ads in two days) ─────────

/** New for_hire ads one account may create per rolling 24 hours. */
export const FOR_HIRE_ADS_PER_DAY = 10;
/** for_hire ads one account may have active at once. */
export const FOR_HIRE_ADS_MAX_ACTIVE = 50;
/** A new ad title is compared against this many of the account's latest ad titles. */
export const FOR_HIRE_DUPLICATE_TITLE_WINDOW = 50;

// ── Application caps ──────────────────────────────────────────────────

/** Applications one account may send per rolling 24 hours. */
export const APPLICATIONS_PER_DAY = 50;
/** Daily cap for agent accounts younger than NEW_AGENT_AGE_DAYS. */
export const NEW_AGENT_APPLICATIONS_PER_DAY = 20;
/** An agent account is "new" for this many days after it was created. */
export const NEW_AGENT_AGE_DAYS = 7;
/** A cover letter is compared against this many of the applicant's latest letters. */
export const COVER_LETTER_DUPLICATE_WINDOW = 20;

/** applications.metadata.held value for applications from spam-flagged profiles. */
export const HELD_SPAM_REVIEW = "spam_review";
/** PostgREST column path used to leave held applications out of poster views. */
export const HELD_COLUMN = "metadata->>held";

// ── Results ───────────────────────────────────────────────────────────

export type LimitRejection = {
  ok: false;
  status: 409 | 429;
  error: string;
  /** Seconds until the caller can succeed, when that is knowable. */
  retryAfterSeconds?: number;
};

export type LimitResult = { ok: true } | LimitRejection;

/** Turn a rejection into the JSON response the API routes return. */
export function limitResponse(rejection: LimitRejection): NextResponse {
  const response = NextResponse.json(
    { error: rejection.error, retry_after: rejection.retryAfterSeconds ?? null },
    { status: rejection.status }
  );
  if (rejection.retryAfterSeconds !== undefined) {
    response.headers.set("Retry-After", String(rejection.retryAfterSeconds));
  }
  return response;
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Expiry window for a listing type. */
export function expiryDaysFor(listingType: string | null | undefined): number {
  return listingType === "for_hire" ? FOR_HIRE_AD_EXPIRY_DAYS : HIRING_GIG_EXPIRY_DAYS;
}

/** expires_at for a gig that becomes active (or is renewed) at `now`. */
export function computeExpiresAt(
  listingType: string | null | undefined,
  now: Date = new Date()
): string {
  return new Date(now.getTime() + expiryDaysFor(listingType) * DAY_MS).toISOString();
}

/**
 * A gig the expiry cron paused: paused with expires_at in the past. A gig the
 * owner paused by hand before it expired also qualifies once its date passes,
 * which is fine: renewing is what they would need either way.
 */
export function isGigExpired(
  gig: { status: string; expires_at?: string | null },
  now: Date = new Date()
): boolean {
  if (gig.status !== "paused" || !gig.expires_at) return false;
  return new Date(gig.expires_at).getTime() <= now.getTime();
}

/**
 * Normalize an ad title for the near-duplicate check: case, digits and
 * punctuation are ignored, so "a00017 CLI, $5.99 USDC (UNIQUE)" and
 * "A00018 cli $6.99 usdc unique" compare equal.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\p{N}+/gu, "")
    .replace(/[^\p{L}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize a cover letter for the duplicate check: whitespace and case only. */
export function normalizeCoverLetter(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Seconds until the oldest event in a rolling window drops out of it, at
 * least 1 so a Retry-After of 0 never invites an immediate retry loop.
 */
export function retryAfterFromOldest(
  oldestIso: string | null | undefined,
  windowMs: number,
  now: Date = new Date()
): number | undefined {
  if (!oldestIso) return undefined;
  const ms = new Date(oldestIso).getTime() + windowMs - now.getTime();
  return Math.max(1, Math.ceil(ms / 1000));
}

/** Count rows in the window and return the oldest timestamp in it. */
async function countInWindow(
  query: PromiseLike<{
    data: { created_at: string }[] | null;
    count: number | null;
    error: unknown;
  }>
): Promise<{ count: number; oldest: string | null }> {
  const { data, count, error } = await query;
  if (error) throw error;
  return { count: count ?? 0, oldest: data?.[0]?.created_at ?? null };
}

// ── For-hire ads ──────────────────────────────────────────────────────

/**
 * New-ad rate: at most FOR_HIRE_ADS_PER_DAY ads created per rolling 24h,
 * drafts included (a draft can be published later without a new check).
 */
export async function checkForHireAdRate(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date()
): Promise<LimitResult> {
  const since = new Date(now.getTime() - DAY_MS).toISOString();
  const { count, oldest } = await countInWindow(
    supabase
      .from("gigs")
      .select("created_at", { count: "exact" })
      .eq("poster_id", userId)
      .eq("listing_type", "for_hire")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(1)
  );
  if (count < FOR_HIRE_ADS_PER_DAY) return { ok: true };
  return {
    ok: false,
    status: 429,
    error: `You can post at most ${FOR_HIRE_ADS_PER_DAY} for-hire ads in 24 hours. Try again later, or update an existing ad instead.`,
    retryAfterSeconds: retryAfterFromOldest(oldest, DAY_MS, now),
  };
}

/**
 * Checks for an ad that is about to be active: the active-ad cap and the
 * near-duplicate title check. `excludeGigId` is the ad itself when an
 * existing ad is being activated, renewed or edited.
 */
export async function checkForHireAdActivation(
  supabase: SupabaseClient,
  userId: string,
  title: string,
  excludeGigId?: string
): Promise<LimitResult> {
  let activeQuery = supabase
    .from("gigs")
    .select("id", { count: "exact", head: true })
    .eq("poster_id", userId)
    .eq("listing_type", "for_hire")
    .eq("status", "active");
  if (excludeGigId) activeQuery = activeQuery.neq("id", excludeGigId);
  const { count: activeCount, error: activeError } = await activeQuery;
  if (activeError) throw activeError;
  if ((activeCount ?? 0) >= FOR_HIRE_ADS_MAX_ACTIVE) {
    return {
      ok: false,
      status: 429,
      error: `You already have ${FOR_HIRE_ADS_MAX_ACTIVE} active for-hire ads, the most one account can have. Pause or close one first.`,
    };
  }

  const normalized = normalizeTitle(title);
  if (!normalized) return { ok: true };

  let recentQuery = supabase
    .from("gigs")
    .select("id, title")
    .eq("poster_id", userId)
    .eq("listing_type", "for_hire");
  if (excludeGigId) recentQuery = recentQuery.neq("id", excludeGigId);
  const { data: recent, error: recentError } = await recentQuery
    .order("created_at", { ascending: false })
    .limit(FOR_HIRE_DUPLICATE_TITLE_WINDOW);
  if (recentError) throw recentError;

  const duplicate = (recent ?? []).some(
    (row: { title: string | null }) => normalizeTitle(row.title ?? "") === normalized
  );
  if (duplicate) {
    return {
      ok: false,
      status: 409,
      error:
        "You already have a for-hire ad with this title (ignoring numbers, case and punctuation). Edit that ad instead of posting a copy.",
    };
  }
  return { ok: true };
}

// ── Applications ──────────────────────────────────────────────────────

export type ApplicantProfile = {
  account_type?: string | null;
  created_at?: string | null;
  is_spam?: boolean | null;
};

/** The applicant's daily cap: stricter for agent accounts in their first week. */
export function dailyApplicationCap(
  profile: ApplicantProfile | null | undefined,
  now: Date = new Date()
): number {
  if (profile?.account_type === "agent" && profile.created_at) {
    const ageMs = now.getTime() - new Date(profile.created_at).getTime();
    if (ageMs < NEW_AGENT_AGE_DAYS * DAY_MS) return NEW_AGENT_APPLICATIONS_PER_DAY;
  }
  return APPLICATIONS_PER_DAY;
}

export type ApplicationCheck =
  | { ok: true; held: boolean }
  | LimitRejection;

/**
 * Run before an application is created (or a withdrawn one resubmitted).
 *
 * - Rate: at most dailyApplicationCap() applications per rolling 24h (429).
 * - Duplicate: a cover letter equal, after whitespace/case normalization, to
 *   any of the applicant's last COVER_LETTER_DUPLICATE_WINDOW letters (409).
 * - Held: a spam-flagged applicant is let through with held = true; the route
 *   stores metadata.held so the poster never sees or hears about it.
 *
 * `excludeApplicationId` is the withdrawn row being resubmitted, so its own
 * old letter does not count as a duplicate.
 */
export async function checkApplicationLimits(
  supabase: SupabaseClient,
  userId: string,
  coverLetter: string,
  options: { excludeApplicationId?: string; now?: Date } = {}
): Promise<ApplicationCheck> {
  const now = options.now ?? new Date();

  // A missing profile is not a reason to block: it gets the standard cap.
  const { data: profile } = await supabase
    .from("profiles")
    .select("account_type, created_at, is_spam")
    .eq("id", userId)
    .single();

  const cap = dailyApplicationCap(profile as ApplicantProfile | null, now);
  const since = new Date(now.getTime() - DAY_MS).toISOString();
  const { count, oldest } = await countInWindow(
    supabase
      .from("applications")
      .select("created_at", { count: "exact" })
      .eq("applicant_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(1)
  );
  if (count >= cap) {
    return {
      ok: false,
      status: 429,
      error:
        cap === NEW_AGENT_APPLICATIONS_PER_DAY
          ? `New agent accounts can send at most ${cap} applications in 24 hours during their first ${NEW_AGENT_AGE_DAYS} days. Apply where your skills match the gig.`
          : `You can send at most ${cap} applications in 24 hours. Apply where your skills match the gig.`,
      retryAfterSeconds: retryAfterFromOldest(oldest, DAY_MS, now),
    };
  }

  const normalized = normalizeCoverLetter(coverLetter);
  let recentQuery = supabase
    .from("applications")
    .select("id, cover_letter")
    .eq("applicant_id", userId);
  if (options.excludeApplicationId) {
    recentQuery = recentQuery.neq("id", options.excludeApplicationId);
  }
  const { data: recent, error: recentError } = await recentQuery
    .order("created_at", { ascending: false })
    .limit(COVER_LETTER_DUPLICATE_WINDOW);
  if (recentError) throw recentError;

  const duplicate = (recent ?? []).some(
    (row: { cover_letter: string | null }) =>
      normalizeCoverLetter(row.cover_letter ?? "") === normalized
  );
  if (duplicate) {
    return {
      ok: false,
      status: 409,
      error:
        "This cover letter is the same as one you already sent. Tailor it to this gig: say why your skills fit what it asks for.",
    };
  }

  return { ok: true, held: (profile as ApplicantProfile | null)?.is_spam === true };
}

/** metadata to store on a new application, given the check result. */
export function heldMetadata(held: boolean): { held: string } | undefined {
  return held ? { held: HELD_SPAM_REVIEW } : undefined;
}
