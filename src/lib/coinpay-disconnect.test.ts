import { describe, it, expect, vi } from "vitest";
import {
  findBlockingPayout,
  findConnectedIdentity,
  logIdentityEvent,
} from "@/lib/coinpay-disconnect";

/**
 * Cover for #537: a CoinPay identity stuck on the wrong ugig profile with no
 * way to release it. The release must be narrow (own link only) and must not
 * happen while a payout that depends on the link is in flight.
 */

/** Minimal PostgREST-shaped stub: every builder method chains, `limit` resolves. */
function stubTable(rows: unknown[] | null, capture?: (calls: string[][]) => void) {
  const calls: string[][] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "or", "order", "limit", "maybeSingle", "insert", "delete"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args.map((a) => JSON.stringify(a))]);
      capture?.(calls);
      if (method === "limit") return Promise.resolve({ data: rows, error: null });
      if (method === "maybeSingle") {
        return Promise.resolve({ data: rows?.[0] ?? null, error: null });
      }
      if (method === "insert") return Promise.resolve({ data: null, error: null });
      return builder;
    };
  }
  // `limit(...).maybeSingle()` — limit must stay chainable for that path too.
  const limitFn = builder.limit as (...a: unknown[]) => unknown;
  builder.limit = (...args: unknown[]) => {
    const p = limitFn(...args) as Promise<unknown>;
    (p as unknown as Record<string, unknown>).maybeSingle = () =>
      Promise.resolve({ data: rows?.[0] ?? null, error: null });
    return p;
  };
  return builder;
}

function stubClient(tables: Record<string, unknown[] | null>) {
  return {
    from: (table: string) => stubTable(tables[table] ?? []),
  };
}

describe("findBlockingPayout", () => {
  it("blocks while a bounty payout to the caller is invoiced but unpaid", async () => {
    const supabase = stubClient({ bounty_submissions: [{ id: "sub-1" }] });
    const reason = await findBlockingPayout(supabase, "user-1");

    expect(reason).toMatch(/bounty payout/i);
  });

  it("blocks while a gig invoice is awaiting payment", async () => {
    const supabase = stubClient({ bounty_submissions: [], gig_invoices: [{ id: "inv-1" }] });
    const reason = await findBlockingPayout(supabase, "user-1");

    expect(reason).toMatch(/invoice awaiting payment/i);
  });

  it("allows the disconnect when nothing is in flight", async () => {
    const supabase = stubClient({ bounty_submissions: [], gig_invoices: [] });

    expect(await findBlockingPayout(supabase, "user-1")).toBeNull();
  });

  it("treats a null result as nothing pending rather than blocking forever", async () => {
    const supabase = stubClient({ bounty_submissions: null, gig_invoices: null });

    expect(await findBlockingPayout(supabase, "user-1")).toBeNull();
  });

  it("scopes the bounty check to the caller and the invoiced state", async () => {
    const calls: string[][] = [];
    const supabase = {
      from: (table: string) =>
        stubTable(table === "bounty_submissions" ? [] : [], (c) => calls.push(...c.slice(calls.length))),
    };
    await findBlockingPayout(supabase, "user-1");

    const flat = JSON.stringify(calls);
    expect(flat).toContain("submitter_id");
    expect(flat).toContain("user-1");
    expect(flat).toContain("invoiced");
  });
});

describe("findConnectedIdentity", () => {
  it("returns the identity attached to this profile", async () => {
    const supabase = stubClient({
      oauth_identities: [{ id: "id-1", provider_user_id: "sub-abc", email: "a@example.com" }],
    });
    const identity = await findConnectedIdentity(supabase, "user-1");

    expect(identity?.id).toBe("id-1");
    expect(identity?.provider_user_id).toBe("sub-abc");
  });

  it("returns null when nothing is connected", async () => {
    const supabase = stubClient({ oauth_identities: [] });

    expect(await findConnectedIdentity(supabase, "user-1")).toBeNull();
  });
});

describe("logIdentityEvent", () => {
  it("writes an audit row carrying the provider identity", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: () => ({ insert }) };

    await logIdentityEvent(supabase, {
      userId: "user-1",
      provider: "coinpay",
      providerUserId: "sub-abc",
      event: "disconnected",
      email: "a@example.com",
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        provider: "coinpay",
        provider_user_id: "sub-abc",
        event: "disconnected",
      })
    );
  });

  it("never throws when the audit write fails — it must not break the disconnect", async () => {
    const supabase = {
      from: () => ({ insert: () => Promise.reject(new Error("table missing")) }),
    };

    await expect(
      logIdentityEvent(supabase, { userId: "u", provider: "coinpay", event: "disconnected" })
    ).resolves.toBeUndefined();
  });
});
