/**
 * Redeemable credit codes and scarce invites (server only).
 *
 * - A credit code (@profullstack/redeem-credits, `CR-XXXX-...`) grants days of
 *   Pro. It is minted by an admin and handed to someone; they redeem it on
 *   /dashboard/subscription ("Have a code?"), via POST /api/credits/redeem or
 *   `ugig redeem <code>`.
 * - An invite (@profullstack/affiliates, `INV-XXXX-...`) is scarce: every
 *   account gets INVITE_QUOTA. When a NEW account joins on one, both people get
 *   INVITE_BONUS_PRO_DAYS of Pro, but only once the new account has confirmed
 *   its email and passes ugig's spam heuristics (profiles.is_spam, checkSpam,
 *   the username randomness model, checkEmail).
 *
 * Pro is never tracked in a second place: every grant goes through
 * extendProDays(), the same subscriptions row CoinPay payments extend. The
 * credit_ledger table is the audit trail of grants (one row per redemption or
 * bonus; a unique index on invite sources makes bonuses idempotent).
 *
 * The open affiliate link stays ugig's existing referral link
 * (/api/referrals/code, `?ref=` + the `referral_code` cookie): no second
 * affiliate code is minted here, so a signup is never counted twice.
 *
 * Clients are built lazily so env vars are read at runtime, not inlined at build.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { Credits, supabaseStore as creditStore, type Grant } from "@profullstack/redeem-credits";
import { Affiliates, supabaseStore as affiliateStore } from "@profullstack/affiliates";
import { createServiceClient } from "@/lib/supabase/service";
import { extendProDays } from "@/lib/payments/checkout-settlement";
import { checkEmail, checkSpam } from "@/lib/spam-check";
import { looksRandomUsername } from "@/lib/username-randomness";

/** The only unit ugig codes grant. */
export const PRO_DAYS_UNIT = "pro_days";
/** Invites every account may create (admins can raise one user's with setQuota). */
export const INVITE_QUOTA = 3;
/** Pro days each side gets when an invited account passes the spam checks. */
export const INVITE_BONUS_PRO_DAYS = 7;
/** An account can hand out invites once it is this old (stops sock-puppet chains). */
export const INVITE_MIN_ACCOUNT_AGE_DAYS = 7;
/** Only accounts at most this old can accept an invite: invites are for new people. */
export const INVITE_ACCEPT_MAX_ACCOUNT_AGE_DAYS = 7;
/** Invite codes expire after this many days. */
export const INVITE_TTL_DAYS = 30;
/** Cookie /i/<code> sets so the code survives the trip through signup. */
export const INVITE_COOKIE = "ugig_invite";

const DAY_MS = 24 * 60 * 60 * 1000;

type Db = SupabaseClient<any>;

export type CreditDeps = {
  db: Db;
  credits: Credits;
  affiliates: Affiliates;
  now: () => number;
};

/** Build the services over a supabase-js service-role client. */
export function buildCreditDeps(db: Db, now: () => number = Date.now): CreditDeps {
  const credits = new Credits(creditStore(db), {
    now,
    onGrant: async (userId: string, grant: Grant, source: string) => {
      await applyGrant(db, userId, grant, source);
    },
  });
  const affiliates = new Affiliates(affiliateStore(db), {
    now,
    defaultQuota: INVITE_QUOTA,
    inviteTtlMs: INVITE_TTL_DAYS * DAY_MS,
  });
  return { db, credits, affiliates, now };
}

let _deps: CreditDeps | undefined;
export function getCreditDeps(): CreditDeps {
  return (_deps ??= buildCreditDeps(createServiceClient() as unknown as Db));
}

/** Test hook. */
export function setCreditDepsForTest(deps: CreditDeps | undefined) {
  _deps = deps;
}

/** Mirror one committed grant into the subscriptions row (the existing paid path). */
export async function applyGrant(db: Db, userId: string, grant: Grant, source: string) {
  if (grant.unit !== PRO_DAYS_UNIT) {
    console.error("[credits] grant with an unknown unit ignored", { userId, unit: grant.unit, source });
    return;
  }
  const days = grant.amount;
  const isInvite = source.startsWith("invite:");
  const result = await extendProDays(db, {
    userId,
    days,
    source,
    title: isInvite ? `Invite bonus: ${days} days of Pro` : `Code redeemed: ${days} days of Pro`,
  });
  if (!result) {
    console.log("[credits] grant to a Lifetime member; plan unchanged", { userId, source });
  }
}

// ── Credit codes ─────────────────────────────────────────────────────

export type RedeemFailure = "invalid" | "expired" | "used_up" | "already_redeemed" | "revoked";

export const REDEEM_MESSAGES: Record<RedeemFailure, string> = {
  invalid: "That code is not valid. Check it and try again.",
  expired: "That code has expired.",
  used_up: "That code has already been used.",
  already_redeemed: "You have already redeemed that code.",
  revoked: "That code is no longer valid.",
};

export async function redeemCreditCode(
  userId: string,
  code: string,
  deps: CreditDeps = getCreditDeps()
): Promise<
  | { ok: true; days: number; currentPeriodEnd: string | null }
  | { ok: false; reason: RedeemFailure; message: string }
> {
  const r = await deps.credits.redeem(String(code ?? ""), userId);
  if (!r.ok) return { ok: false, reason: r.reason, message: REDEEM_MESSAGES[r.reason] };
  return { ok: true, days: r.grant.amount, currentPeriodEnd: await currentPeriodEnd(deps.db, userId) };
}

export async function mintCreditCode(
  o: { days: number; label?: string; maxRedemptions?: number; expiresAt?: number | null; createdBy?: string },
  deps: CreditDeps = getCreditDeps()
) {
  if (!Number.isInteger(o.days) || o.days < 1 || o.days > 3660) {
    throw new TypeError("days must be a whole number from 1 to 3660");
  }
  return deps.credits.mint({
    grant: { unit: PRO_DAYS_UNIT, amount: o.days },
    label: o.label ?? `${o.days} days of ugig Pro`,
    maxRedemptions: o.maxRedemptions ?? 1,
    expiresAt: o.expiresAt ?? null,
    createdBy: o.createdBy,
  });
}

async function currentPeriodEnd(db: Db, userId: string): Promise<string | null> {
  const { data } = await db
    .from("subscriptions")
    .select("current_period_end")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { current_period_end: string | null } | null)?.current_period_end ?? null;
}

// ── Invites ──────────────────────────────────────────────────────────

type ProfileRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  agent_name: string | null;
  account_type: string | null;
  created_at: string | null;
  is_spam: boolean | null;
};

async function getProfile(db: Db, userId: string): Promise<ProfileRow | null> {
  const { data } = await db
    .from("profiles")
    .select("id, username, full_name, agent_name, account_type, created_at, is_spam")
    .eq("id", userId)
    .maybeSingle();
  return (data as ProfileRow | null) ?? null;
}

function ageDays(createdAt: string | null | undefined, now: number): number {
  if (!createdAt) return 0;
  return (now - new Date(createdAt).getTime()) / DAY_MS;
}

/**
 * Whether an account passes ugig's existing spam heuristics: the stored
 * is_spam flag (set by the check_username_spam trigger), the signup-time
 * checks re-run against the current username/name, and the email rules.
 * Returns the first reason it fails, or null when it passes.
 */
export function spamReason(
  profile: Pick<ProfileRow, "username" | "full_name" | "agent_name" | "is_spam"> | null,
  email: string | null | undefined
): string | null {
  if (!profile) return "no profile";
  if (profile.is_spam === true) return "flagged as spam";
  const username = profile.username ?? "";
  if (!username) return "no username";
  if (checkSpam(username, profile.agent_name ?? profile.full_name).spam) return "username or name fails spam check";
  if (looksRandomUsername(username)) return "username looks random";
  if (!email) return "no email";
  if (checkEmail(email).spam) return "email fails spam check";
  return null;
}

export type InviteRow = {
  id: string;
  createdAt: number;
  expiresAt: number | null;
  usedBy: string | null;
  usedAt: number | null;
  note: string;
  revokedAt: number | null;
  status: "open" | "used" | "expired" | "revoked";
  usedByUsername?: string | null;
  bonus?: "granted" | "pending";
};

export async function inviteOverview(userId: string, deps: CreditDeps = getCreditDeps()) {
  const now = deps.now();
  const [quota, raw, profile] = await Promise.all([
    deps.affiliates.quota(userId),
    deps.affiliates.invites(userId),
    getProfile(deps.db, userId),
  ]);
  const usedIds = raw.map((i) => i.usedBy).filter((u): u is string => !!u);
  const usernames = new Map<string, string | null>();
  if (usedIds.length) {
    const { data } = await deps.db.from("profiles").select("id, username").in("id", usedIds);
    for (const p of (data ?? []) as { id: string; username: string | null }[]) usernames.set(p.id, p.username);
  }
  const granted = new Set<string>();
  if (raw.some((i) => i.usedBy)) {
    for (const e of await deps.credits.history(userId, PRO_DAYS_UNIT)) {
      if (e.kind === "grant" && e.source.startsWith("invite:")) granted.add(e.source);
    }
  }
  const invites: InviteRow[] = raw.map((i) => ({
    id: i.id,
    createdAt: i.createdAt,
    expiresAt: i.expiresAt,
    usedBy: i.usedBy,
    usedAt: i.usedAt,
    note: i.note,
    revokedAt: i.revokedAt ?? null,
    status: i.usedBy
      ? "used"
      : i.revokedAt
        ? "revoked"
        : i.expiresAt !== null && now >= i.expiresAt
          ? "expired"
          : "open",
    ...(i.usedBy
      ? {
          usedByUsername: usernames.get(i.usedBy) ?? null,
          bonus: granted.has(inviteSource(i.id, "inviter")) ? ("granted" as const) : ("pending" as const),
        }
      : {}),
  }));
  const age = ageDays(profile?.created_at, now);
  const canInvite = age >= INVITE_MIN_ACCOUNT_AGE_DAYS && profile?.is_spam !== true;
  return {
    quota,
    invites,
    canInvite,
    unlocksAt:
      !canInvite && profile?.created_at && profile.is_spam !== true
        ? new Date(new Date(profile.created_at).getTime() + INVITE_MIN_ACCOUNT_AGE_DAYS * DAY_MS).toISOString()
        : null,
    bonusDays: INVITE_BONUS_PRO_DAYS,
  };
}

export class InviteError extends Error {
  constructor(
    message: string,
    public status: number,
    public reason: string
  ) {
    super(message);
  }
}

export async function createInvite(userId: string, note = "", deps: CreditDeps = getCreditDeps()) {
  const profile = await getProfile(deps.db, userId);
  if (!profile) throw new InviteError("Profile not found.", 404, "no_profile");
  if (profile.is_spam === true) throw new InviteError("This account cannot send invites.", 403, "flagged");
  if (ageDays(profile.created_at, deps.now()) < INVITE_MIN_ACCOUNT_AGE_DAYS) {
    throw new InviteError(
      `Invites unlock once your account is ${INVITE_MIN_ACCOUNT_AGE_DAYS} days old.`,
      403,
      "too_new"
    );
  }
  try {
    return await deps.affiliates.createInvite(userId, String(note ?? "").slice(0, 200));
  } catch (err) {
    if (/no invites left/i.test(String((err as Error)?.message))) {
      throw new InviteError("You have no invites left.", 409, "no_invites_left");
    }
    throw err;
  }
}

export async function revokeInvite(userId: string, inviteId: string, deps: CreditDeps = getCreditDeps()) {
  const mine = (await deps.affiliates.invites(userId)).find((i) => i.id === inviteId);
  if (!mine) throw new InviteError("Invite not found.", 404, "not_found");
  if (mine.usedBy) throw new InviteError("That invite has already been used.", 409, "used");
  await deps.affiliates.revokeInvite(inviteId);
}

export const ACCEPT_MESSAGES: Record<string, string> = {
  invalid: "That invite code is not valid.",
  expired: "That invite has expired.",
  used: "That invite has already been used.",
  self: "You cannot use your own invite.",
  revoked: "That invite was withdrawn.",
  already_invited: "Your account has already joined on an invite.",
  not_new: `Invites are for new accounts (${INVITE_ACCEPT_MAX_ACCOUNT_AGE_DAYS} days old or less).`,
  no_profile: "Profile not found.",
};

/**
 * Spend an invite on a (new) account and record who invited whom. The bonus
 * is NOT granted here; settleInviteBonus() grants it once the account passes
 * the spam checks, and is called right after, on email confirmation, and
 * whenever either side opens /dashboard/invites.
 */
export async function acceptInvite(
  userId: string,
  code: string,
  deps: CreditDeps = getCreditDeps()
): Promise<
  | { ok: true; inviterId: string; inviteId: string; bonus: "granted" | "pending"; pendingReason?: string }
  | { ok: false; reason: string; message: string }
> {
  const fail = (reason: string) => ({ ok: false as const, reason, message: ACCEPT_MESSAGES[reason] ?? reason });
  const profile = await getProfile(deps.db, userId);
  if (!profile) return fail("no_profile");
  if (ageDays(profile.created_at, deps.now()) > INVITE_ACCEPT_MAX_ACCOUNT_AGE_DAYS) return fail("not_new");
  // No invitedBy() pre-check: it is a racy read. Since @profullstack/affiliates 0.3
  // the database lets an account redeem ONE invite, atomically (aff_claim_invite +
  // unique index aff_invites_one_per_user), so a second or concurrent accept comes
  // back `already_invited` without spending that invite.
  const r = await deps.affiliates.redeemInvite(String(code ?? ""), userId);
  if (!r.ok) return fail(r.reason);

  const settled = await settleInviteBonus(userId, deps);
  return {
    ok: true,
    inviterId: r.inviterId,
    inviteId: r.inviteId,
    bonus: settled.status === "granted" || settled.status === "already" ? "granted" : "pending",
    ...(settled.status === "pending" ? { pendingReason: settled.reason } : {}),
  };
}

export function inviteSource(inviteId: string, side: "inviter" | "invitee") {
  return `invite:${inviteId}:${side}`;
}

function isDuplicate(err: unknown) {
  return /duplicate key|unique|23505/i.test(String((err as Error)?.message ?? err));
}

async function grantOnce(deps: CreditDeps, userId: string, source: string): Promise<boolean> {
  const done = (await deps.credits.history(userId, PRO_DAYS_UNIT)).some(
    (e) => e.kind === "grant" && e.source === source
  );
  if (done) return false;
  try {
    await deps.credits.grant(userId, { unit: PRO_DAYS_UNIT, amount: INVITE_BONUS_PRO_DAYS }, source);
    return true;
  } catch (err) {
    // The unique index on (user_id, source) for invite grants: a concurrent
    // settle won the race. The ledger insert failed, so onGrant never ran.
    if (isDuplicate(err)) return false;
    throw err;
  }
}

async function emailOf(db: Db, userId: string): Promise<{ email: string | null; confirmed: boolean }> {
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error || !data?.user) return { email: null, confirmed: false };
  const u = data.user as { email?: string | null; email_confirmed_at?: string | null; confirmed_at?: string | null };
  return { email: u.email ?? null, confirmed: Boolean(u.email_confirmed_at ?? u.confirmed_at) };
}

/**
 * Grant the invite bonus to both sides if the invited account qualifies now.
 * Idempotent: each side gets it once per invite. Safe to call often.
 */
export async function settleInviteBonus(
  inviteeId: string,
  deps: CreditDeps = getCreditDeps()
): Promise<
  | { status: "none" }
  | { status: "pending"; reason: string }
  | { status: "granted" | "already"; inviteId: string; inviterId: string }
> {
  const inviterId = await deps.affiliates.invitedBy(inviteeId);
  if (!inviterId) return { status: "none" };
  const invite = (await deps.affiliates.invites(inviterId)).find((i) => i.usedBy === inviteeId);
  if (!invite) return { status: "none" };

  const [invitee, inviter, auth] = await Promise.all([
    getProfile(deps.db, inviteeId),
    getProfile(deps.db, inviterId),
    emailOf(deps.db, inviteeId),
  ]);
  if (!auth.confirmed) return { status: "pending", reason: "email not confirmed" };
  const why = spamReason(invitee, auth.email);
  if (why) {
    console.warn("[invites] bonus held:", { inviteeId, inviteId: invite.id, why });
    return { status: "pending", reason: why };
  }

  const gotInvitee = await grantOnce(deps, inviteeId, inviteSource(invite.id, "invitee"));
  // An inviter flagged since sending the invite does not get paid for it.
  let gotInviter = false;
  if (inviter && inviter.is_spam !== true) {
    gotInviter = await grantOnce(deps, inviterId, inviteSource(invite.id, "inviter"));
  }
  return { status: gotInvitee || gotInviter ? "granted" : "already", inviteId: invite.id, inviterId };
}

/** Settle every used invite this user sent (cheap: at most the quota). */
export async function settleInvitesSentBy(inviterId: string, deps: CreditDeps = getCreditDeps()) {
  for (const inv of await deps.affiliates.invites(inviterId)) {
    if (inv.usedBy) {
      try {
        await settleInviteBonus(inv.usedBy, deps);
      } catch (err) {
        console.error("[invites] settle failed", { inviteId: inv.id, err });
      }
    }
  }
}

/** Normalize a code for display in a URL: `INV-7K3M-QX9D-2F8H`. */
export function inviteUrl(appUrl: string, code: string) {
  return `${appUrl.replace(/\/$/, "")}/i/${encodeURIComponent(code)}`;
}
