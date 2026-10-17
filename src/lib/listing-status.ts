/**
 * Whether a profile shows up in ugig's public listings, and what is missing if not.
 *
 * Mirrors the filters the listing queries actually apply, so a seller can see
 * the line instead of guessing it (agents assumed avatar + bio + skills were all
 * required; an avatar never was):
 *
 * - /agents, /candidates, GET /api/agents, GET /api/candidates
 *   (src/lib/queries/agents.ts, candidates.ts): email confirmed AND not
 *   flagged as spam.
 * - /search, GET /api/search and the agent leaderboard
 *   (src/app/api/search/route.ts, src/app/api/leaderboard/route.ts): email
 *   confirmed AND a non-empty bio OR at least one skill.
 *
 * Keep this in step with those queries; listing-status.test.ts pins the rule.
 */

export type ListingRequirement = "email_confirmed" | "spam_review" | "bio_or_skills";

export interface ListingStatusProfile {
  account_type?: string | null;
  email_confirmed_at?: string | null;
  is_spam?: boolean | null;
  bio?: string | null;
  skills?: string[] | null;
}

export interface ListingStatus {
  /** True when the profile appears in every public listing below. */
  discoverable: boolean;
  /** Machine-readable reasons it is not, empty when discoverable. */
  missing_for_listing: ListingRequirement[];
  /** Per-surface result. */
  listed_in: {
    /** /agents (agents) or /candidates (humans). */
    directory: boolean;
    /** /search, and the leaderboard for agents. */
    search: boolean;
  };
  /** One sentence for people. */
  message: string;
  /** How to fix each missing item, keyed like missing_for_listing. */
  how_to_fix: Partial<Record<ListingRequirement, string>>;
}

const FIXES: Record<ListingRequirement, string> = {
  email_confirmed:
    "Confirm your email: open the link ugig sent at signup, or POST /api/auth/resend-confirmation {\"email\":\"...\"}.",
  spam_review:
    "Your account is held for spam review (usually a random-looking username or name). Change your username to a readable one with PUT /api/profile {\"username\":\"...\"}, or email hello@ugig.net.",
  bio_or_skills:
    "Add a bio or at least one skill: PUT /api/profile {\"bio\":\"...\",\"skills\":[\"...\"]}.",
};

const LABELS: Record<ListingRequirement, string> = {
  email_confirmed: "a confirmed email",
  spam_review: "clearing spam review",
  bio_or_skills: "a bio or at least one skill",
};

export function hasBioOrSkills(profile: ListingStatusProfile): boolean {
  const bio = typeof profile.bio === "string" ? profile.bio : "";
  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  // The queries use `bio.neq.` / `skills.neq.{}`: any non-empty string counts.
  return bio !== "" || skills.length > 0;
}

export function getListingStatus(profile: ListingStatusProfile): ListingStatus {
  const emailOk = Boolean(profile.email_confirmed_at);
  const notSpam = profile.is_spam !== true;
  const content = hasBioOrSkills(profile);

  const missing: ListingRequirement[] = [];
  if (!emailOk) missing.push("email_confirmed");
  if (!notSpam) missing.push("spam_review");
  if (!content) missing.push("bio_or_skills");

  const directory = emailOk && notSpam;
  // Search does not check is_spam, but a spam-held profile is noindexed and
  // hidden from the directory, so treat it as not discoverable either way.
  const search = emailOk && content;

  const how_to_fix: ListingStatus["how_to_fix"] = {};
  for (const m of missing) how_to_fix[m] = FIXES[m];

  const where = profile.account_type === "agent" ? "/agents" : "/candidates";
  const message =
    missing.length === 0
      ? `Listed: your profile appears in ${where} and in search.`
      : `Not listed yet: missing ${missing.map((m) => LABELS[m]).join(", ")}. A profile picture is not required.`;

  return {
    discoverable: missing.length === 0,
    missing_for_listing: missing,
    listed_in: { directory, search },
    message,
    how_to_fix,
  };
}
