import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeSupabase } from "@/lib/orders/fake-supabase.test-helper";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => state.db.client }));
vi.mock("@/lib/coinpay-link-health", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/coinpay-link-health")>();
  return { ...actual, markCoinpayLinkBroken: vi.fn(async () => ({ notified: true })) };
});

import { getCoinpayLink, refreshCoinpayToken } from "./coinpay-oauth";
import { markCoinpayLinkBroken } from "@/lib/coinpay-link-health";

const HOUR = 3600_000;
const live = (extra: Record<string, unknown> = {}) => ({
  access_token: "old-access",
  refresh_token: "rt-1",
  scope: "openid profile email wallet:read",
  expires_at: new Date(Date.now() - HOUR).toISOString(),
  ...extra,
});
const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("COINPAY_OAUTH_CLIENT_ID", "cp_test");
  vi.stubEnv("COINPAY_OAUTH_CLIENT_SECRET", crypto.randomUUID());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("refreshCoinpayToken", () => {
  it("stores and returns the new token", async () => {
    state.db = fakeSupabase({ oauth_identities: [{ id: "i1", metadata: live() }] });
    const r = await refreshCoinpayToken("rt-1", "i1", live(), respond(200, { access_token: "new", refresh_token: "rt-2", expires_in: 3600 }));
    expect(r).toEqual({ ok: true, accessToken: "new" });
    expect(state.db.updates.oauth_identities[0].metadata).toMatchObject({ access_token: "new", refresh_token: "rt-2" });
  });

  it("calls CoinPay refusing the refresh token 'rejected'", async () => {
    state.db = fakeSupabase({ oauth_identities: [{ id: "i1", metadata: live() }] });
    const r = await refreshCoinpayToken("rt-1", "i1", live(), respond(400, { error: "invalid_grant" }));
    expect(r).toEqual({ ok: false, failure: "rejected" });
  });

  it("calls an outage, a gateway page or a 402 'transient', never 'rejected'", async () => {
    state.db = fakeSupabase({ oauth_identities: [{ id: "i1", metadata: live() }] });
    for (const f of [respond(502, "Bad Gateway"), respond(402, { x402Version: 2 }), respond(400, "<html>"), vi.fn(async () => { throw new TypeError("fetch failed"); })]) {
      expect(await refreshCoinpayToken("rt-1", "i1", live(), f as never)).toEqual({ ok: false, failure: "transient" });
    }
  });

  it("recovers from a rotation race: another request already refreshed the link", async () => {
    const winner = live({ access_token: "winner", refresh_token: "rt-2", expires_at: new Date(Date.now() + HOUR).toISOString() });
    state.db = fakeSupabase({ oauth_identities: [{ id: "i1", metadata: winner }] });
    const r = await refreshCoinpayToken("rt-1", "i1", live(), respond(400, { error: "invalid_grant" }));
    expect(r).toEqual({ ok: true, accessToken: "winner" });
  });
});

describe("getCoinpayLink", () => {
  const row = (metadata: Record<string, unknown>) => ({ id: "i1", user_id: "u1", provider: "coinpay", metadata });

  it("marks a refused link broken (which tells the seller) and asks for a reconnect", async () => {
    state.db = fakeSupabase({ oauth_identities: [row(live())] });
    vi.stubGlobal("fetch", respond(400, { error: "invalid_grant" }));
    expect(await getCoinpayLink("u1")).toEqual({ state: "needs_reconnect", accessToken: null });
    expect(markCoinpayLinkBroken).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "i1" }), "refresh_rejected");
  });

  it("does not blame the seller when CoinPay is down", async () => {
    state.db = fakeSupabase({ oauth_identities: [row(live())] });
    vi.stubGlobal("fetch", respond(503, "down"));
    expect(await getCoinpayLink("u1")).toEqual({ state: "needs_reconnect", accessToken: null, temporary: true });
    expect(markCoinpayLinkBroken).not.toHaveBeenCalled();
  });

  it("keeps using a token inside the early-refresh window when CoinPay is down", async () => {
    state.db = fakeSupabase({ oauth_identities: [row(live({ expires_at: new Date(Date.now() + 60_000).toISOString() }))] });
    vi.stubGlobal("fetch", respond(503, "down"));
    expect(await getCoinpayLink("u1")).toEqual({ state: "connected", accessToken: "old-access" });
  });

  it("an expired link with no refresh token is broken (the backfill case)", async () => {
    state.db = fakeSupabase({ oauth_identities: [row(live({ refresh_token: undefined }))] });
    expect((await getCoinpayLink("u1")).state).toBe("needs_reconnect");
    expect(markCoinpayLinkBroken).toHaveBeenCalledWith(expect.anything(), expect.anything(), "no_refresh_token");
  });

  it("a link already marked broken is not sent to CoinPay again", async () => {
    state.db = fakeSupabase({ oauth_identities: [row(live({ link_error: { code: "refresh_rejected" } }))] });
    const f = respond(200, {});
    vi.stubGlobal("fetch", f);
    expect((await getCoinpayLink("u1")).state).toBe("needs_reconnect");
    expect(f).not.toHaveBeenCalled();
  });
});
