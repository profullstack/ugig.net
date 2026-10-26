import { describe, it, expect, beforeEach } from "vitest";
import { Credits, memoryStore as creditMemory } from "@profullstack/redeem-credits";
import { Affiliates, memoryStore as affMemory } from "@profullstack/affiliates";
import {
  INVITE_BONUS_PRO_DAYS,
  acceptInvite,
  applyGrant,
  createInvite,
  inviteOverview,
  mintCreditCode,
  redeemCreditCode,
  revokeInvite,
  settleInviteBonus,
  spamReason,
  type CreditDeps,
} from "./credits";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-26T12:00:00Z");

type Row = Record<string, any>;

/** Just enough of supabase-js for credits.ts and extendProDays(). */
function fakeDb() {
  const tables: Record<string, Row[]> = { profiles: [], subscriptions: [], notifications: [] };
  const users = new Map<string, { email: string; email_confirmed_at: string | null }>();

  function query(table: string) {
    const filters: [string, unknown][] = [];
    let inFilter: [string, unknown[]] | null = null;
    const rows = () =>
      (tables[table] ??= []).filter(
        (r) => filters.every(([k, v]) => r[k] === v) && (!inFilter || inFilter[1].includes(r[inFilter[0]]))
      );
    const q: any = {
      select: () => q,
      eq: (k: string, v: unknown) => (filters.push([k, v]), q),
      in: (k: string, v: unknown[]) => ((inFilter = [k, v]), q),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: (v: unknown) => void) => res({ data: rows(), error: null }),
      insert: async (row: Row) => {
        (tables[table] ??= []).push({ id: `${table}-${tables[table].length + 1}`, ...row });
        return { error: null };
      },
      upsert: async (row: Row, opts: { onConflict: string }) => {
        const key = opts.onConflict;
        const t = (tables[table] ??= []);
        const i = t.findIndex((r) => r[key] === row[key]);
        if (i >= 0) t[i] = { ...t[i], ...row };
        else t.push({ id: `${table}-${t.length + 1}`, ...row });
        return { error: null };
      },
    };
    return q;
  }

  const db: any = {
    from: query,
    auth: {
      admin: {
        getUserById: async (id: string) => {
          const u = users.get(id);
          return u ? { data: { user: { id, ...u } }, error: null } : { data: { user: null }, error: { message: "nope" } };
        },
      },
    },
  };
  return { db, tables, users };
}

let env: ReturnType<typeof fakeDb>;
let deps: CreditDeps;

function addUser(id: string, o: { username: string; ageDays: number; spam?: boolean; confirmed?: boolean; email?: string }) {
  env.tables.profiles.push({
    id,
    username: o.username,
    full_name: null,
    agent_name: null,
    account_type: "human",
    created_at: new Date(NOW - o.ageDays * DAY).toISOString(),
    is_spam: o.spam ?? false,
  });
  env.users.set(id, {
    email: o.email ?? `${o.username}@example.com`,
    email_confirmed_at: o.confirmed === false ? null : new Date(NOW).toISOString(),
  });
}

function sub(userId: string): Row {
  return env.tables.subscriptions.find((s) => s.user_id === userId) as Row;
}

beforeEach(() => {
  env = fakeDb();
  const now = () => NOW;
  deps = {
    db: env.db,
    now,
    credits: new Credits(creditMemory(), { now, onGrant: (u, g, s) => applyGrant(env.db, u, g, s) }),
    affiliates: new Affiliates(affMemory(), { now, defaultQuota: 3, inviteTtlMs: 30 * DAY }),
  };
  addUser("alice", { username: "alice", ageDays: 60 });
});

describe("credit codes", () => {
  it("grants days of Pro through the subscriptions row", async () => {
    const { code } = await mintCreditCode({ days: 30 }, deps);
    const r = await redeemCreditCode("alice", code.toLowerCase().replace(/-/g, " "), deps);
    expect(r.ok).toBe(true);
    const s = sub("alice");
    expect(s.plan).toBe("pro");
    expect(s.status).toBe("active");
    expect(Math.abs(Date.parse(s.current_period_end) - (Date.now() + 30 * DAY))).toBeLessThan(60_000);
    expect(env.tables.notifications.at(-1)?.title).toMatch(/30 days of Pro/);
  });

  it("extends a running Pro period instead of restarting it", async () => {
    const end = new Date(Date.now() + 10 * DAY).toISOString();
    env.tables.subscriptions.push({ id: "s1", user_id: "alice", plan: "pro", status: "active", current_period_start: "x", current_period_end: end, stripe_subscription_id: null });
    const { code } = await mintCreditCode({ days: 5 }, deps);
    await redeemCreditCode("alice", code, deps);
    expect(Date.parse(sub("alice").current_period_end)).toBe(Date.parse(end) + 5 * DAY);
  });

  it("leaves Lifetime alone", async () => {
    env.tables.subscriptions.push({ id: "s1", user_id: "alice", plan: "lifetime", status: "active", current_period_end: null });
    const { code } = await mintCreditCode({ days: 5 }, deps);
    expect((await redeemCreditCode("alice", code, deps)).ok).toBe(true);
    expect(sub("alice").plan).toBe("lifetime");
  });

  it("refuses bad, reused and used-up codes with friendly messages", async () => {
    expect(await redeemCreditCode("alice", "CR-NOPE", deps)).toMatchObject({ ok: false, reason: "invalid" });
    const { code } = await mintCreditCode({ days: 5 }, deps);
    await redeemCreditCode("alice", code, deps);
    expect(await redeemCreditCode("alice", code, deps)).toMatchObject({ ok: false, reason: "already_redeemed" });
    addUser("bob", { username: "bob", ageDays: 1 });
    const r = await redeemCreditCode("bob", code, deps);
    expect(r).toMatchObject({ ok: false, reason: "used_up" });
    if (!r.ok) expect(r.message).toMatch(/already been used/);
  });

  it("validates mint input", async () => {
    await expect(mintCreditCode({ days: 0 }, deps)).rejects.toThrow();
    await expect(mintCreditCode({ days: 1.5 }, deps)).rejects.toThrow();
  });
});

describe("spamReason", () => {
  it("passes a normal account and holds flagged or random ones", () => {
    const ok = { username: "janedoe", full_name: "Jane Doe", agent_name: null, is_spam: false };
    expect(spamReason(ok, "jane@example.com")).toBeNull();
    expect(spamReason({ ...ok, is_spam: true }, "jane@example.com")).toMatch(/spam/);
    expect(spamReason({ ...ok, username: "xkqzvbwtrp" }, "jane@example.com")).not.toBeNull();
    expect(spamReason(ok, null)).toMatch(/email/);
    expect(spamReason(null, "jane@example.com")).toMatch(/profile/);
  });
});

describe("invites", () => {
  it("needs a week-old account to invite", async () => {
    addUser("newbie", { username: "newbie", ageDays: 2 });
    await expect(createInvite("newbie", "", deps)).rejects.toMatchObject({ reason: "too_new", status: 403 });
    const o = await inviteOverview("newbie", deps);
    expect(o.canInvite).toBe(false);
    expect(o.unlocksAt).not.toBeNull();
  });

  it("caps invites at 3 and refunds a withdrawn one", async () => {
    const a = await createInvite("alice", "one", deps);
    await createInvite("alice", "two", deps);
    await createInvite("alice", "three", deps);
    await expect(createInvite("alice", "four", deps)).rejects.toMatchObject({ reason: "no_invites_left", status: 409 });
    await revokeInvite("alice", a.id, deps);
    expect((await inviteOverview("alice", deps)).quota.left).toBe(1);
  });

  it("grants both sides the bonus once a confirmed, clean new account accepts", async () => {
    const inv = await createInvite("alice", "for Carol", deps);
    addUser("carol", { username: "carol", ageDays: 0 });
    const r = await acceptInvite("carol", inv.code, deps);
    expect(r).toMatchObject({ ok: true, bonus: "granted" });
    for (const u of ["alice", "carol"]) {
      expect(sub(u).plan).toBe("pro");
      expect(Math.abs(Date.parse(sub(u).current_period_end) - (Date.now() + INVITE_BONUS_PRO_DAYS * DAY))).toBeLessThan(60_000);
    }
    // Settling again (page views, confirm link) never grants twice.
    const end = sub("carol").current_period_end;
    expect((await settleInviteBonus("carol", deps)).status).toBe("already");
    expect(sub("carol").current_period_end).toBe(end);
    const o = await inviteOverview("alice", deps);
    expect(o.invites[0]).toMatchObject({ status: "used", usedByUsername: "carol", bonus: "granted" });
  });

  it("holds the bonus until the email is confirmed", async () => {
    const inv = await createInvite("alice", "", deps);
    addUser("dave", { username: "dave", ageDays: 0, confirmed: false });
    expect(await acceptInvite("dave", inv.code, deps)).toMatchObject({ ok: true, bonus: "pending" });
    expect(sub("dave")).toBeUndefined();
    expect(sub("alice")).toBeUndefined();
    env.users.get("dave")!.email_confirmed_at = new Date(NOW).toISOString();
    expect((await settleInviteBonus("dave", deps)).status).toBe("granted");
    expect(sub("dave").plan).toBe("pro");
    expect(sub("alice").plan).toBe("pro");
  });

  it("never pays out for a spam-flagged invitee", async () => {
    const inv = await createInvite("alice", "", deps);
    addUser("bot", { username: "bot", ageDays: 0, spam: true });
    expect(await acceptInvite("bot", inv.code, deps)).toMatchObject({ ok: true, bonus: "pending" });
    expect(await settleInviteBonus("bot", deps)).toMatchObject({ status: "pending", reason: "flagged as spam" });
    expect(sub("bot")).toBeUndefined();
    expect(sub("alice")).toBeUndefined();
  });

  it("refuses old accounts, second invites, own invites and reused codes", async () => {
    const one = await createInvite("alice", "", deps);
    const two = await createInvite("alice", "", deps);
    expect(await acceptInvite("alice", one.code, deps)).toMatchObject({ ok: false, reason: "not_new" });
    addUser("erin", { username: "erin", ageDays: 1 });
    expect((await acceptInvite("erin", one.code, deps)).ok).toBe(true);
    expect(await acceptInvite("erin", two.code, deps)).toMatchObject({ ok: false, reason: "already_invited" });
    addUser("frank", { username: "frank", ageDays: 1 });
    expect(await acceptInvite("frank", one.code, deps)).toMatchObject({ ok: false, reason: "used" });
    expect(await acceptInvite("frank", "INV-0000-0000-0000", deps)).toMatchObject({ ok: false, reason: "invalid" });
    // The second invite was not burned by erin's refused attempt.
    expect((await acceptInvite("frank", two.code, deps)).ok).toBe(true);
  });

  it("two simultaneous accepts of different invites: one wins and pays, the other is already_invited and stays unused", async () => {
    addUser("gina", { username: "gina", ageDays: 60 });
    const a = await createInvite("alice", "", deps);
    const g = await createInvite("gina", "", deps);
    addUser("erin", { username: "erin", ageDays: 1 });
    const [r1, r2] = await Promise.all([acceptInvite("erin", a.code, deps), acceptInvite("erin", g.code, deps)]);
    expect([r1, r2].filter((r) => r.ok)).toHaveLength(1);
    expect([r1, r2].find((r) => !r.ok)).toMatchObject({ ok: false, reason: "already_invited" });
    // Exactly one inviter is paid; the losing invite is still spendable by someone else.
    expect([sub("alice"), sub("gina")].filter(Boolean)).toHaveLength(1);
    const loser = r1.ok ? g : a;
    addUser("frank", { username: "frank", ageDays: 1 });
    expect((await acceptInvite("frank", loser.code, deps)).ok).toBe(true);
  });
});
