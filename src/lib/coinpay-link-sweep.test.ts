import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeSupabase } from "@/lib/orders/fake-supabase.test-helper";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ success: true })) }));

import { sweepAction, sweepCoinpayLinks } from "./coinpay-link-sweep";
import { reconnectNotice } from "./coinpay-link-health";
import { migrateLegacyCoinpayIdentity } from "./coinpay-oauth";
import { sendEmail } from "@/lib/email";

const NOW = Date.parse("2026-10-28T17:00:00Z");
const DAY = 86_400_000;
const SOL = "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV";
const meta = (extra: Record<string, unknown> = {}) => ({
  access_token: "a",
  refresh_token: "rt",
  scope: "openid wallet:read",
  expires_at: new Date(NOW - DAY).toISOString(),
  refreshed_at: new Date(NOW - DAY).toISOString(),
  ...extra,
});
const snapshot = (extra: Record<string, unknown> = {}) => ({
  scope: "openid wallet:read",
  wallets: [{ currency: "usdc_sol", cryptocurrency: "USDC_SOL", label: null, address: SOL, network: null }],
  wallets_synced_at: "2026-10-28T00:00:00Z",
  ...extra,
});

describe("sweepAction", () => {
  it("leaves a snapshot link alone", () => {
    expect(sweepAction(snapshot(), true)).toEqual({ action: "ok" });
  });
  it("migrates any link still holding a token, even one marked broken (one more try)", () => {
    expect(sweepAction(meta(), true)).toEqual({ action: "migrate" });
    expect(sweepAction(meta({ link_error: { code: "refresh_rejected" } }), true)).toEqual({ action: "migrate" });
  });
  it("after the cutoff, scrubs tokens instead of reading them", () => {
    expect(sweepAction(meta(), false)).toEqual({ action: "scrub" });
  });
  it("flags a link with neither wallets nor tokens", () => {
    expect(sweepAction({ scope: "openid" }, true)).toEqual({ action: "broken", fault: "missing_scope" });
    expect(sweepAction({ link_error: { code: "no_refresh_token" } }, true)).toEqual({ action: "broken", fault: "no_refresh_token" });
  });
});

describe("sweepCoinpayLinks", () => {
  let db: ReturnType<typeof fakeSupabase>;
  const auth = { admin: { getUserById: vi.fn(async (id: string) => ({ data: { user: { email: `${id}@example.com` } } })) } };

  beforeEach(() => {
    vi.clearAllMocks();
    db = fakeSupabase({
      oauth_identities: [
        { id: "i1", user_id: "seller", provider: "coinpay", metadata: meta(), updated_at: "2026-10-27" },
        { id: "i2", user_id: "nolisting", provider: "coinpay", metadata: meta({ refresh_token: undefined }), updated_at: "2026-10-26" },
        { id: "i3", user_id: "told", provider: "coinpay", metadata: { scope: "openid", link_error: { code: "refresh_rejected" }, reconnect_notified_at: "2026-10-27" }, updated_at: "2026-10-25" },
        { id: "i4", user_id: "fine", provider: "coinpay", metadata: snapshot(), updated_at: "2026-10-24" },
      ],
      gigs: [{ id: "g1", title: "Story", poster_id: "seller", listing_type: "for_hire", status: "active" }],
      notifications: [],
    });
  });
  const client = () => ({ ...db.client, auth }) as never;
  const tokenFree = () =>
    (db.updates.oauth_identities ?? []).every((u: any) => !("access_token" in u.metadata) && !("refresh_token" in u.metadata));

  it("migrates live legacy links and deletes their tokens", async () => {
    const refresh = vi.fn(async () => ({ ok: true as const, accessToken: "new" }));
    const readWallets = vi.fn(async () => ({ status: "ok" as const, wallets: snapshot().wallets as any }));
    const migrate: typeof migrateLegacyCoinpayIdentity = (svc, row, deps) =>
      migrateLegacyCoinpayIdentity(svc, row, { ...deps, refresh, readWallets });
    const r = await sweepCoinpayLinks(client(), { now: new Date(NOW), migrate, legacyEnabled: true });
    expect(refresh).toHaveBeenCalledWith("rt", "i1", expect.anything());
    expect(r).toMatchObject({ links: 4, migrated: 1, legacyRemaining: 0, broken: { no_refresh_token: 1, refresh_rejected: 1 } });
    expect(tokenFree()).toBe(true);
    const migrated: any = db.updates.oauth_identities.find((u: any) => Array.isArray(u.metadata.wallets));
    expect(migrated.metadata.wallets[0].address).toBe(SOL);
  });

  it("tells a seller once, by email and in-app, when CoinPay refuses their link, and still deletes the token", async () => {
    const refresh = vi.fn(async () => ({ ok: false as const, failure: "rejected" as const }));
    const migrate: typeof migrateLegacyCoinpayIdentity = (svc, row, deps) => migrateLegacyCoinpayIdentity(svc, row, { ...deps, refresh });
    const r = await sweepCoinpayLinks(client(), { now: new Date(NOW), migrate, legacyEnabled: true });
    expect(r).toMatchObject({ links: 4, migrated: 0, notified: 1, legacyRemaining: 0, broken: { refresh_rejected: 2, no_refresh_token: 1 } });
    expect(db.inserts.notifications).toHaveLength(1);
    expect(db.inserts.notifications[0]).toMatchObject({ user_id: "seller", data: { link: "/settings/connections" } });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toBe("seller@example.com");
    const marked = db.updates.oauth_identities.map((u: any) => u.metadata);
    expect(marked.some((m: any) => m.link_error?.code === "refresh_rejected" && m.reconnect_notified_at)).toBe(true);
    // A link with no listing is recorded but its owner is not mailed.
    expect(marked.some((m: any) => m.link_error?.code === "no_refresh_token" && !m.reconnect_notified_at)).toBe(true);
    expect(tokenFree()).toBe(true);
  });

  it("an outage is not a dead link: the token stays for the next run", async () => {
    const refresh = vi.fn(async () => ({ ok: false as const, failure: "transient" as const }));
    const migrate: typeof migrateLegacyCoinpayIdentity = (svc, row, deps) => migrateLegacyCoinpayIdentity(svc, row, { ...deps, refresh });
    const r = await sweepCoinpayLinks(client(), { now: new Date(NOW), migrate, legacyEnabled: true });
    expect(r.transient).toBe(1);
    expect(r.legacyRemaining).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("after the cutoff, deletes leftover tokens without calling CoinPay", async () => {
    const migrate = vi.fn();
    const r = await sweepCoinpayLinks(client(), { now: new Date(NOW), migrate: migrate as never, legacyEnabled: false });
    expect(migrate).not.toHaveBeenCalled();
    expect(r).toMatchObject({ scrubbed: 2, legacyRemaining: 0 });
    expect(tokenFree()).toBe(true);
  });

  it("dry run migrates, writes and sends nothing, and counts what is left", async () => {
    const migrate = vi.fn();
    const r = await sweepCoinpayLinks(client(), { now: new Date(NOW), migrate: migrate as never, dryRun: true, legacyEnabled: true });
    expect(migrate).not.toHaveBeenCalled();
    expect(r.legacyRemaining).toBe(2);
    expect(db.updates.oauth_identities ?? []).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("reconnectNotice", () => {
  it("links to Settings > Connections and the affected listing", () => {
    const n = reconnectNotice([{ id: "g1", title: "Story <b>" }], "https://ugig.net");
    expect(n.text).toContain("https://ugig.net/settings/connections");
    expect(n.text).toContain("https://ugig.net/gigs/g1");
    expect(n.html).toContain("Story &lt;b&gt;");
  });
});
