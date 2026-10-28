import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeSupabase } from "@/lib/orders/fake-supabase.test-helper";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => state.db.client }));
vi.mock("@/lib/coinpay-link-health", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/coinpay-link-health")>();
  return { ...actual, markCoinpayLinkBroken: vi.fn(async () => ({ notified: true })) };
});

vi.mock("@/lib/coinpayportal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/coinpayportal")>();
  return { ...actual, readCoinpayUserinfoWallets: vi.fn() };
});

import { getCoinpayLink, refreshCoinpayToken } from "./coinpay-oauth";
import { markCoinpayLinkBroken } from "@/lib/coinpay-link-health";
import { readCoinpayUserinfoWallets } from "@/lib/coinpayportal";

const SOL = "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV";
const wallet = { currency: "usdc_sol", cryptocurrency: "USDC_SOL", label: null, address: SOL, network: "solana" };

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
  const lastMetadata = () => state.db.updates.oauth_identities.at(-1).metadata;

  it("a snapshot link answers from the database: no token, no CoinPay call", async () => {
    state.db = fakeSupabase({
      oauth_identities: [row({ scope: "wallet:read", wallets: [wallet], wallets_synced_at: "2026-10-28T00:00:00Z" })],
    });
    const f = respond(200, {});
    vi.stubGlobal("fetch", f);
    expect(await getCoinpayLink("u1")).toEqual({ state: "connected", wallets: [wallet], syncedAt: "2026-10-28T00:00:00Z" });
    expect(f).not.toHaveBeenCalled();
    expect(readCoinpayUserinfoWallets).not.toHaveBeenCalled();
  });

  it("an empty snapshot is connected with no wallets (not a reconnect)", async () => {
    state.db = fakeSupabase({ oauth_identities: [row({ wallets: [] })] });
    expect(await getCoinpayLink("u1")).toMatchObject({ state: "connected", wallets: [] });
  });

  it("no row is none; a row with neither wallets nor tokens needs a reconnect", async () => {
    state.db = fakeSupabase({ oauth_identities: [] });
    expect(await getCoinpayLink("u1")).toEqual({ state: "none", wallets: null });
    state.db = fakeSupabase({ oauth_identities: [row({ scope: "openid" })] });
    expect(await getCoinpayLink("u1")).toEqual({ state: "needs_reconnect", wallets: null });
  });

  it("migrates a legacy token link on first use: snapshot written, tokens deleted in the same update", async () => {
    state.db = fakeSupabase({ oauth_identities: [row(live({ coinpay_sub: "sub-1" }))] });
    vi.stubGlobal("fetch", respond(200, { access_token: "fresh", refresh_token: "rt-2", expires_in: 3600 }));
    vi.mocked(readCoinpayUserinfoWallets).mockResolvedValue({ status: "ok", wallets: [{ ...wallet, raw: { secretish: 1 } }] } as any);
    const link = await getCoinpayLink("u1");
    expect(link).toMatchObject({ state: "connected", wallets: [wallet] });
    expect(readCoinpayUserinfoWallets).toHaveBeenCalledWith("fresh");
    const m = lastMetadata();
    for (const k of ["access_token", "refresh_token", "expires_at", "token_type", "refreshed_at"]) expect(m).not.toHaveProperty(k);
    expect(m).toMatchObject({ coinpay_sub: "sub-1", wallets: [wallet] });
    expect(m.wallets[0]).not.toHaveProperty("raw");
    expect(typeof m.wallets_synced_at).toBe("string");
  });

  it("uses a still-valid legacy access token without refreshing it", async () => {
    state.db = fakeSupabase({ oauth_identities: [row(live({ expires_at: new Date(Date.now() + HOUR).toISOString() }))] });
    const f = respond(500, "should not be called");
    vi.stubGlobal("fetch", f);
    vi.mocked(readCoinpayUserinfoWallets).mockResolvedValue({ status: "ok", wallets: [wallet] } as any);
    expect((await getCoinpayLink("u1")).state).toBe("connected");
    expect(readCoinpayUserinfoWallets).toHaveBeenCalledWith("old-access");
    expect(f).not.toHaveBeenCalled();
  });

  it("a refused legacy link loses its tokens and is marked broken (which tells the seller)", async () => {
    state.db = fakeSupabase({ oauth_identities: [row(live())] });
    vi.stubGlobal("fetch", respond(400, { error: "invalid_grant" }));
    expect(await getCoinpayLink("u1")).toEqual({ state: "needs_reconnect", wallets: null });
    expect(markCoinpayLinkBroken).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "i1", metadata: expect.not.objectContaining({ refresh_token: expect.anything() }) }),
      "refresh_rejected",
      expect.any(Date)
    );
  });

  it("does not blame the seller when CoinPay is down, and keeps the token for the next try", async () => {
    state.db = fakeSupabase({ oauth_identities: [row(live())] });
    vi.stubGlobal("fetch", respond(503, "down"));
    expect(await getCoinpayLink("u1")).toEqual({ state: "needs_reconnect", wallets: null, temporary: true });
    expect(markCoinpayLinkBroken).not.toHaveBeenCalled();
    expect(state.db.updates.oauth_identities ?? []).toHaveLength(0);
  });

  it("a userinfo outage after a refresh is transient too", async () => {
    state.db = fakeSupabase({ oauth_identities: [row(live())] });
    vi.stubGlobal("fetch", respond(200, { access_token: "fresh", refresh_token: "rt-2", expires_in: 3600 }));
    vi.mocked(readCoinpayUserinfoWallets).mockRejectedValue(new Error("CoinPay userinfo failed: 502"));
    expect(await getCoinpayLink("u1")).toMatchObject({ state: "needs_reconnect", temporary: true });
    expect(markCoinpayLinkBroken).not.toHaveBeenCalled();
  });

  it("an expired legacy link with no refresh token is broken (the backfill case)", async () => {
    state.db = fakeSupabase({ oauth_identities: [row(live({ refresh_token: undefined }))] });
    expect((await getCoinpayLink("u1")).state).toBe("needs_reconnect");
    expect(markCoinpayLinkBroken).toHaveBeenCalledWith(expect.anything(), expect.anything(), "no_refresh_token", expect.any(Date));
  });

  it("a link already marked broken is not sent to CoinPay again", async () => {
    state.db = fakeSupabase({ oauth_identities: [row(live({ link_error: { code: "refresh_rejected" } }))] });
    const f = respond(200, {});
    vi.stubGlobal("fetch", f);
    expect((await getCoinpayLink("u1")).state).toBe("needs_reconnect");
    expect(f).not.toHaveBeenCalled();
  });

  it("LEGACY_KEY_MIGRATION=off: a legacy token is never read", async () => {
    vi.stubEnv("LEGACY_KEY_MIGRATION", "off");
    state.db = fakeSupabase({ oauth_identities: [row(live({ expires_at: new Date(Date.now() + HOUR).toISOString() }))] });
    const f = respond(200, {});
    vi.stubGlobal("fetch", f);
    expect(await getCoinpayLink("u1")).toEqual({ state: "needs_reconnect", wallets: null });
    expect(f).not.toHaveBeenCalled();
    expect(readCoinpayUserinfoWallets).not.toHaveBeenCalled();
  });
});
