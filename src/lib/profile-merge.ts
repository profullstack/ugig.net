import type { ProfileInput } from "@/lib/validations";

/**
 * Merge semantics for `PUT`/`PATCH /api/profile` (#536).
 *
 * `profileSchema` gives `skills`, `ai_tools`, `portfolio_urls` and
 * `wallet_addresses` a `.default([])` (and `is_available` a `.default(true)`)
 * so the profile *form* has something to bind to. Zod materialises those
 * defaults for any key the caller left out, so spreading the parsed object
 * straight into an `UPDATE` wrote `[]` over arrays the caller never mentioned —
 * a partial update that set one scalar silently wiped the seller's payout
 * `wallet_addresses`, their `skills` and their `portfolio_urls`.
 *
 * So the write set is the keys the caller actually sent, not the keys Zod
 * produced. An omitted key is left alone; an explicit `[]` still clears.
 */

/** Fields the merge needs from the stored row to stay correct. */
export interface StoredProfileFields {
  full_name?: string | null;
  bio?: string | null;
  skills?: string[] | null;
  agent_name?: string | null;
  account_type?: string | null;
}

const AGENT_ONLY_FIELDS = [
  "agent_name",
  "agent_description",
  "agent_version",
  "agent_operator_url",
  "agent_source_url",
] as const;

/**
 * Narrow a parsed profile body to only the keys present in the raw request
 * body. Keys the caller omitted are dropped so the UPDATE never touches them.
 */
export function pickSubmitted(
  rawBody: Record<string, unknown>,
  parsed: ProfileInput
): Record<string, unknown> {
  const submitted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (Object.prototype.hasOwnProperty.call(rawBody, key)) {
      submitted[key] = value;
    }
  }
  return submitted;
}

/**
 * The value a field will hold after the update: what the caller sent when they
 * sent it, otherwise what is already stored.
 */
function merged<K extends keyof StoredProfileFields>(
  submitted: Record<string, unknown>,
  current: StoredProfileFields | null | undefined,
  key: K
): StoredProfileFields[K] {
  return Object.prototype.hasOwnProperty.call(submitted, key)
    ? (submitted[key] as StoredProfileFields[K])
    : current?.[key];
}

/**
 * `account_type: "agent"` requires an `agent_name`, but under merge semantics a
 * caller who already has one stored need not resend it.
 */
export function resolvedAgentName(
  submitted: Record<string, unknown>,
  current: StoredProfileFields | null | undefined
): string | null | undefined {
  return merged(submitted, current, "agent_name");
}

/**
 * A profile counts as complete on the *merged* result, not on the fragment that
 * happened to be in this request — otherwise `{"is_available": true}` would
 * mark a fully filled-in profile incomplete.
 */
export function isProfileComplete(
  submitted: Record<string, unknown>,
  current: StoredProfileFields | null | undefined
): boolean {
  const skills = merged(submitted, current, "skills");
  return Boolean(
    merged(submitted, current, "full_name") ||
      merged(submitted, current, "bio") ||
      (Array.isArray(skills) && skills.length > 0)
  );
}

/**
 * Build the row to write: the submitted keys, plus the agent-field clearing
 * that switching to a human account implies, plus the derived columns.
 */
export function buildProfileUpdate(
  rawBody: Record<string, unknown>,
  parsed: ProfileInput,
  current: StoredProfileFields | null | undefined
): Record<string, unknown> {
  const submitted = pickSubmitted(rawBody, parsed);

  // Switching to a human account clears the agent-only fields even though the
  // caller did not name them — that is the point of the transition.
  if (submitted.account_type === "human") {
    for (const field of AGENT_ONLY_FIELDS) submitted[field] = null;
  }

  return {
    ...submitted,
    profile_completed: isProfileComplete(submitted, current),
    updated_at: new Date().toISOString(),
  };
}
