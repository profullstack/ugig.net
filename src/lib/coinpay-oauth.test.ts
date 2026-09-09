import { describe, expect, it } from "vitest";
import { coinpayLinkCanReadWallets } from "./coinpay-oauth";

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
