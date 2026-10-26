/**
 * Guards for POST /api/auth/confirmed, so that the welcome flow (email,
 * Lightning wallet, referral reward) is safe by construction and does not rely
 * on the webhook secret alone:
 *
 *  - the user must really have confirmed their email, recently, according to
 *    auth.users (the request body is not trusted for this or for the address);
 *  - each user is processed at most once, ever (auth_confirmed_processed).
 */

/** How long after email_confirmed_at the webhook is still accepted. */
export const CONFIRMATION_WINDOW_MS = 15 * 60 * 1000;

type Db = {
  auth: { admin: { getUserById: (id: string) => Promise<{ data: { user: unknown } | null; error: unknown }> } };
  from: (table: string) => any;
};

export type ConfirmedUser = { email: string; confirmedAt: number };

export type FreshCheck =
  | { ok: true; user: ConfirmedUser }
  | { ok: false; reason: "user_not_found" | "not_confirmed" | "stale_confirmation" };

/** Look the user up in auth.users and require a confirmation within the window. */
export async function checkFreshConfirmation(
  db: Db,
  userId: string,
  now: number = Date.now()
): Promise<FreshCheck> {
  const { data, error } = await db.auth.admin.getUserById(userId);
  const user = (data?.user ?? null) as { email?: string | null; email_confirmed_at?: string | null } | null;
  if (error || !user || !user.email) return { ok: false, reason: "user_not_found" };
  if (!user.email_confirmed_at) return { ok: false, reason: "not_confirmed" };
  const confirmedAt = Date.parse(user.email_confirmed_at);
  if (!Number.isFinite(confirmedAt) || now - confirmedAt > CONFIRMATION_WINDOW_MS || confirmedAt - now > 60_000) {
    return { ok: false, reason: "stale_confirmation" };
  }
  return { ok: true, user: { email: user.email, confirmedAt } };
}

function isDuplicate(err: unknown) {
  const e = err as { code?: string; message?: string } | null;
  return e?.code === "23505" || /duplicate key|unique/i.test(String(e?.message ?? ""));
}

/**
 * Claim the one-time welcome flow for this user. Returns true for exactly one
 * caller per user, ever; false when it was already claimed. Throws on any other
 * database error so the caller does not run the flow unguarded.
 */
export async function claimConfirmation(db: Db, userId: string): Promise<boolean> {
  const { error } = await db.from("auth_confirmed_processed").insert({ user_id: userId });
  if (!error) return true;
  if (isDuplicate(error)) return false;
  throw new Error(`auth_confirmed_processed insert failed: ${(error as { message?: string }).message ?? error}`);
}
