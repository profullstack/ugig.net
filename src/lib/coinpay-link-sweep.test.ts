import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeSupabase } from "@/lib/orders/fake-supabase.test-helper";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ success: true })) }));

import { sweepAction, sweepCoinpayLinks, REFRESH_AFTER_MS } from "./coinpay-link-sweep";
import { reconnectNotice } from "./coinpay-link-health";
import { sendEmail } from "@/lib/email";

const NOW = Date.parse("2026-10-28T17:00:00Z");
const DAY = 86_400_000;
const meta = (extra: Record<string, unknown> = {}) => ({
  access_token: "a",
  refresh_token: "rt",
  scope: "openid wallet:read",
  expires_at: new Date(NOW - DAY).toISOString(),
  refreshed_at: new Date(NOW - DAY).toISOString(),
  ...extra,
});

describe("sweepAction", () => {
  it("leaves a recently rotated link alone", () => {
    expect(sweepAction(meta(), NOW)).toEqual({ action: "ok" });
  });
  it("refreshes a link before CoinPay's 30-day refresh token runs out", () => {
    expect(sweepAction(meta({ refreshed_at: new Date(NOW - REFRESH_AFTER_MS).toISOString() }), NOW)).toEqual({ action: "refresh", refreshToken: "rt" });
    expect(sweepAction(meta({ refreshed_at: undefined, connected_at: "2026-10-01T00:00:00Z" }), NOW).action).toBe("refresh");
  });
  it("flags an expired link with no refresh token, and one without the wallet scope", () => {
    expect(sweepAction(meta({ refresh_token: undefined }), NOW)).toEqual({ action: "broken", fault: "no_refresh_token" });
    expect(sweepAction(meta({ scope: "openid" }), NOW)).toEqual({ action: "broken", fault: "missing_scope" });
  });
});

describe("sweepCoinpayLinks", () => {
  let db: ReturnType<typeof fakeSupabase>;
  const auth = { admin: { getUserById: vi.fn(async (id: string) => ({ data: { user: { email: `${id}@example.com` } } })) } };

  beforeEach(() => {
    vi.clearAllMocks();
    db = fakeSupabase({
      oauth_identities: [
        { id: "i1", user_id: "seller", provider: "coinpay", metadata: meta({ refreshed_at: "2026-10-01T00:00:00Z" }), updated_at: "2026-10-27" },
        { id: "i2", user_id: "nolisting", provider: "coinpay", metadata: meta({ refresh_token: undefined }), updated_at: "2026-10-26" },
        { id: "i3", user_id: "told", provider: "coinpay", metadata: meta({ link_error: { code: "refresh_rejected" }, reconnect_notified_at: "2026-10-27" }), updated_at: "2026-10-25" },
      ],
      gigs: [{ id: "g1", title: "Story", poster_id: "seller", listing_type: "for_hire", status: "active" }],
      notifications: [],
    });
  });
  const client = () => ({ ...db.client, auth }) as never;

  it("tells a seller once, by email and in-app, when CoinPay refuses their link", async () => {
    const refresh = vi.fn(async () => ({ ok: false as const, failure: "rejected" as const }));
    const r = await sweepCoinpayLinks(client(), { now: new Date(NOW), refresh });
    expect(r).toMatchObject({ links: 3, refreshed: 0, notified: 1, broken: { refresh_rejected: 2, no_refresh_token: 1 } });
    expect(db.inserts.notifications).toHaveLength(1);
    expect(db.inserts.notifications[0]).toMatchObject({ user_id: "seller", data: { link: "/settings/connections" } });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toBe("seller@example.com");
    const marked = db.updates.oauth_identities.map((u: any) => u.metadata);
    expect(marked.some((m: any) => m.link_error?.code === "refresh_rejected" && m.reconnect_notified_at)).toBe(true);
    // A link with no listing is recorded but its owner is not mailed.
    expect(marked.some((m: any) => m.link_error?.code === "no_refresh_token" && !m.reconnect_notified_at)).toBe(true);
  });

  it("keeps a healthy link alive and tells nobody", async () => {
    const refresh = vi.fn(async () => ({ ok: true as const, accessToken: "new" }));
    const r = await sweepCoinpayLinks(client(), { now: new Date(NOW), refresh });
    expect(refresh).toHaveBeenCalledWith("rt", "i1", expect.anything());
    expect(r.refreshed).toBe(1);
    expect(db.inserts.notifications ?? []).toHaveLength(0);
  });

  it("an outage is not a dead link", async () => {
    const refresh = vi.fn(async () => ({ ok: false as const, failure: "transient" as const }));
    const r = await sweepCoinpayLinks(client(), { now: new Date(NOW), refresh });
    expect(r.transient).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("dry run refreshes, writes and sends nothing", async () => {
    const refresh = vi.fn();
    await sweepCoinpayLinks(client(), { now: new Date(NOW), refresh: refresh as never, dryRun: true });
    expect(refresh).not.toHaveBeenCalled();
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
