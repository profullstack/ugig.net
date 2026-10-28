import { afterEach, describe, expect, it, vi } from "vitest";
import {
  coinpayIdentityMetadata,
  coinpayLinkCanReadWallets,
  coinpayLinkHasLegacyTokens,
  coinpayLinkWallets,
  mergeRefreshedCoinpayMetadata,
  storedCoinpayLinkState,
  withoutCoinpayTokens,
} from "./coinpay-oauth";

afterEach(() => vi.unstubAllEnvs());

const SOL = "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV";
const EVM = "0x52908400098527886E0F7030069857D2E4169EE7";

// 2026-10-28: ugig keeps the wallet addresses a CoinPay grant can read, never
// the grant's tokens (no user secret may be readable by anything on our boxes).
describe("coinpayIdentityMetadata (OAuth callback)", () => {
  const tokens = { access_token: "at-secret", refresh_token: "rt-secret", token_type: "Bearer", scope: "openid wallet:read", expires_in: 3600 };

  it("stores the userinfo wallets and no token at all", () => {
    const m = coinpayIdentityMetadata(tokens, {
      sub: "sub-1",
      name: "Ann",
      wallets: [{ cryptocurrency: "USDC_SOL", wallet_address: SOL, label: "main" }],
    });
    const json = JSON.stringify(m);
    expect(json).not.toContain("at-secret");
    expect(json).not.toContain("rt-secret");
    expect(coinpayLinkHasLegacyTokens(m)).toBe(false);
    expect(m).toMatchObject({ coinpay_sub: "sub-1", name: "Ann", scope: "openid wallet:read" });
    expect(coinpayLinkWallets(m)).toEqual([
      { currency: "usdc_sol", cryptocurrency: "USDC_SOL", label: "main", address: SOL, network: null },
    ]);
    expect(typeof m.wallets_synced_at).toBe("string");
    expect(coinpayLinkCanReadWallets(m)).toBe(true);
  });

  it("a grant without the wallets claim stores no snapshot, so it reads as needs-reconnect", () => {
    const m = coinpayIdentityMetadata(tokens, { sub: "sub-1" });
    expect(coinpayLinkWallets(m)).toBeNull();
    expect(coinpayLinkCanReadWallets(m)).toBe(false);
    expect(storedCoinpayLinkState(m, true)).toBe("needs_reconnect");
  });

  it("an empty wallets claim is a connected link with no addresses yet", () => {
    const m = coinpayIdentityMetadata(tokens, { sub: "s", wallets: [] });
    expect(coinpayLinkWallets(m)).toEqual([]);
    expect(storedCoinpayLinkState(m, true)).toBe("connected");
  });
});

describe("coinpayLinkWallets", () => {
  it("drops entries whose address does not fit the coin", () => {
    const m = {
      wallets: [
        { currency: "usdc_sol", address: SOL },
        { currency: "usdc_eth", address: EVM },
        { currency: "usdc_sol", address: EVM },
        { currency: "nope", address: SOL },
        "junk",
      ],
    };
    expect(coinpayLinkWallets(m)?.map((w) => w.currency)).toEqual(["usdc_sol", "usdc_eth"]);
  });
});

describe("withoutCoinpayTokens", () => {
  it("removes every token field and keeps the rest", () => {
    const out = withoutCoinpayTokens({ access_token: "a", refresh_token: "r", token_type: "Bearer", expires_at: "x", refreshed_at: "y", coinpay_sub: "s", scope: "wallet:read" });
    expect(out).toEqual({ coinpay_sub: "s", scope: "wallet:read" });
  });
});

describe("LEGACY_KEY_MIGRATION=off", () => {
  it("a legacy token link is no longer usable; a snapshot link still is", () => {
    vi.stubEnv("LEGACY_KEY_MIGRATION", "off");
    const legacy = { access_token: "tok", refresh_token: "rt", scope: "wallet:read", expires_at: "2999-01-01T00:00:00Z" };
    expect(coinpayLinkCanReadWallets(legacy)).toBe(false);
    expect(storedCoinpayLinkState(legacy, true)).toBe("needs_reconnect");
    expect(storedCoinpayLinkState({ wallets: [] }, true)).toBe("connected");
  });
});

// The connections page and the invoice gate must agree on what a usable CoinPay
// link is. They did not: any oauth_identities row rendered as "Connected", while
// invoicing rejected a token without wallet:read. A worker saw a green
// "Connected" badge and "Connect your CoinPay account before sending an invoice"
// from the same account, and reconnecting could not fix it — the ugig.net OAuth
// client was registered without wallet:read, so CoinPay filtered the scope out
// of every grant.
describe("coinpayLinkCanReadWallets", () => {
  it("accepts a token granted wallet:read", () => {
    expect(
      coinpayLinkCanReadWallets({
        access_token: "tok",
        scope: "openid profile email wallet:read",
      })
    ).toBe(true);
  });

  it("rejects a token granted without wallet:read", () => {
    expect(
      coinpayLinkCanReadWallets({ access_token: "tok", scope: "openid profile email" })
    ).toBe(false);
  });

  it("rejects a link with no recorded scope", () => {
    expect(coinpayLinkCanReadWallets({ access_token: "tok", scope: null })).toBe(false);
  });

  it("rejects a link with no access token", () => {
    expect(coinpayLinkCanReadWallets({ scope: "openid wallet:read" })).toBe(false);
  });

  it("rejects a blank access token", () => {
    expect(
      coinpayLinkCanReadWallets({ access_token: "   ", scope: "openid wallet:read" })
    ).toBe(false);
  });

  it("does not match wallet:read as a substring of another scope", () => {
    expect(
      coinpayLinkCanReadWallets({ access_token: "tok", scope: "openid wallet:readwrite" })
    ).toBe(false);
  });

  it("treats a missing or non-object metadata as unusable", () => {
    expect(coinpayLinkCanReadWallets(null)).toBe(false);
    expect(coinpayLinkCanReadWallets(undefined)).toBe(false);
    expect(coinpayLinkCanReadWallets("openid wallet:read")).toBe(false);
  });
});

describe("mergeRefreshedCoinpayMetadata", () => {
  const previous = {
    access_token: "old",
    refresh_token: "rt-old",
    scope: "openid profile email wallet:read",
    coinpay_sub: "sub-1",
    name: "Worker",
    connected_at: "2026-09-01T00:00:00.000Z",
    expires_at: "2026-09-01T01:00:00.000Z",
  };
  const now = Date.parse("2026-10-06T00:00:00.000Z");

  it("keeps the identity fields a refresh used to throw away", () => {
    const next = mergeRefreshedCoinpayMetadata(
      previous,
      { access_token: "new", expires_in: 3600, scope: "openid profile email wallet:read" },
      "rt-old",
      now
    )!;
    expect(next.access_token).toBe("new");
    expect(next.coinpay_sub).toBe("sub-1");
    expect(next.name).toBe("Worker");
    expect(next.connected_at).toBe("2026-09-01T00:00:00.000Z");
    expect(next.expires_at).toBe("2026-10-06T01:00:00.000Z");
    expect(next.refresh_token).toBe("rt-old");
  });

  it("keeps the previous scope when the token response omits it", () => {
    // RFC 6749 5.1: scope may be left out when unchanged. Writing null here
    // turned a healthy link into "reconnect required" on the next check.
    const next = mergeRefreshedCoinpayMetadata(previous, { access_token: "new" }, "rt-old", now)!;
    expect(next.scope).toBe("openid profile email wallet:read");
    expect(coinpayLinkCanReadWallets(next)).toBe(true);
  });

  it("records a narrowed scope when CoinPay reports one", () => {
    const next = mergeRefreshedCoinpayMetadata(
      previous,
      { access_token: "new", scope: "openid profile email" },
      "rt-old",
      now
    )!;
    expect(coinpayLinkCanReadWallets(next)).toBe(false);
  });

  it("stores a rotated refresh token", () => {
    const next = mergeRefreshedCoinpayMetadata(
      previous,
      { access_token: "new", refresh_token: "rt-new" },
      "rt-old",
      now
    )!;
    expect(next.refresh_token).toBe("rt-new");
  });

  it("returns null when the response carries no access token", () => {
    expect(mergeRefreshedCoinpayMetadata(previous, {}, "rt-old", now)).toBeNull();
  });
});

describe("storedCoinpayLinkState", () => {
  const now = Date.parse("2026-10-06T12:00:00.000Z");
  const good = {
    access_token: "tok",
    refresh_token: "rt",
    scope: "openid wallet:read",
    expires_at: "2026-10-06T11:00:00.000Z",
  };

  it("is none without an identity row", () => {
    expect(storedCoinpayLinkState(null, false, now)).toBe("none");
  });

  it("is connected when expired but refreshable", () => {
    expect(storedCoinpayLinkState(good, true, now)).toBe("connected");
  });

  it("needs reconnect when expired with no refresh token", () => {
    expect(storedCoinpayLinkState({ ...good, refresh_token: "" }, true, now)).toBe(
      "needs_reconnect"
    );
  });

  it("is connected when unexpired even without a refresh token", () => {
    expect(
      storedCoinpayLinkState(
        { ...good, refresh_token: undefined, expires_at: "2026-10-06T13:00:00.000Z" },
        true,
        now
      )
    ).toBe("connected");
  });

  it("needs reconnect when wallet:read is missing", () => {
    expect(storedCoinpayLinkState({ ...good, scope: "openid profile email" }, true, now)).toBe(
      "needs_reconnect"
    );
  });

  it("a wallet snapshot is connected with no token at all; a recorded fault is not", () => {
    expect(storedCoinpayLinkState({ wallets: [{ currency: "usdc_sol", address: SOL }] }, true, now)).toBe("connected");
    expect(storedCoinpayLinkState({ wallets: [], link_error: { code: "refresh_rejected" } }, true, now)).toBe("needs_reconnect");
  });
});
