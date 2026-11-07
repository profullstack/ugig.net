import { describe, it, expect } from "vitest";
import { applyCoinpayPass, passFromUserinfo } from "./coinpay-pass";

const DAY = 24 * 60 * 60 * 1000;
type Row = Record<string, any>;

/** Just enough of supabase-js for extendPro(): select/eq/maybeSingle, upsert, insert. */
function fakeDb() {
  const tables: Record<string, Row[]> = { subscriptions: [], notifications: [] };
  function query(table: string) {
    const filters: [string, unknown][] = [];
    const rows = () => (tables[table] ??= []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const q: any = {
      select: () => q,
      eq: (k: string, v: unknown) => (filters.push([k, v]), q),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      insert: async (row: Row) => ((tables[table] ??= []).push(row), { error: null }),
      upsert: async (row: Row, opts: { onConflict: string }) => {
        const t = (tables[table] ??= []);
        const i = t.findIndex((r) => r[opts.onConflict] === row[opts.onConflict]);
        if (i >= 0) t[i] = { ...t[i], ...row };
        else t.push({ id: `sub-${t.length + 1}`, ...row });
        return { error: null };
      },
    };
    return q;
  }
  return { db: { from: query } as any, tables };
}

const inDays = (d: number) => new Date(Date.now() + d * DAY).toISOString();

describe("passFromUserinfo", () => {
  it("is active only with active: true and a future, parseable expires_at", () => {
    expect(passFromUserinfo({ pass: { active: true, expires_at: inDays(30) } }).active).toBe(true);
    expect(passFromUserinfo({ pass: { active: false, expires_at: inDays(30) } }).active).toBe(false);
    expect(passFromUserinfo({ pass: { active: true, expires_at: inDays(-1) } }).active).toBe(false);
    expect(passFromUserinfo({ pass: { active: true, expires_at: "soon" } })).toEqual({ active: false, expiresAt: null });
    expect(passFromUserinfo({ pass: { active: "true", expires_at: inDays(30) } }).active).toBe(false);
    expect(passFromUserinfo({}).active).toBe(false);
    expect(passFromUserinfo(null).active).toBe(false);
  });
});

describe("applyCoinpayPass", () => {
  it("gives Pro until the pass ends, once", async () => {
    const { db, tables } = fakeDb();
    const end = inDays(30);
    const info = { sub: "cp-1", pass: { active: true, expires_at: end } };
    const r = await applyCoinpayPass(db, "u1", info);
    expect(r?.periodEnd.toISOString()).toBe(new Date(end).toISOString());
    expect(tables.subscriptions[0]).toMatchObject({ user_id: "u1", plan: "pro", status: "active" });
    expect(tables.notifications).toHaveLength(1);
    expect(tables.notifications[0].data.source).toBe(`coinpay-pass:cp-1:${new Date(end).toISOString()}`);

    expect(await applyCoinpayPass(db, "u1", info)).toBeNull();
    expect(tables.notifications).toHaveLength(1);
    expect(tables.subscriptions[0].current_period_end).toBe(new Date(end).toISOString());
  });

  it("keeps a longer paid Pro term and never touches Lifetime", async () => {
    const { db, tables } = fakeDb();
    const paidEnd = inDays(60);
    tables.subscriptions.push(
      { id: "s1", user_id: "paid", plan: "pro", status: "active", current_period_end: paidEnd, stripe_subscription_id: null },
      { id: "s2", user_id: "life", plan: "lifetime", status: "active", current_period_end: null }
    );
    const info = { sub: "cp-2", pass: { active: true, expires_at: inDays(30) } };
    expect(await applyCoinpayPass(db, "paid", info)).toBeNull();
    expect(tables.subscriptions[0].current_period_end).toBe(paidEnd);
    expect(await applyCoinpayPass(db, "life", info)).toBeNull();
    expect(tables.subscriptions[1].plan).toBe("lifetime");
    expect(tables.notifications).toHaveLength(0);
  });

  it("does nothing without an active pass", async () => {
    const { db, tables } = fakeDb();
    expect(await applyCoinpayPass(db, "u1", { sub: "cp-3", pass: { active: false } })).toBeNull();
    expect(tables.subscriptions).toHaveLength(0);
  });
});
