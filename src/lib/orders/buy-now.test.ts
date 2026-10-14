import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rates")>();
  return { ...actual, getBtcUsdRate: vi.fn().mockResolvedValue(100_000) };
});
vi.mock("@/lib/coinpay-oauth", () => ({ getCoinpayLink: vi.fn() }));

import { buyNowBlocker, listingPrice, listingPriceUsd, orderFeeUsd, BUY_NOW_FEE_PERCENT } from "./buy-now";

const gig = {
  id: "g1",
  title: "Landing page",
  poster_id: "seller",
  listing_type: "for_hire",
  status: "active",
  budget_type: "fixed",
  budget_min: 50,
  budget_max: null,
  payment_coin: "USDC",
};

describe("buyNowBlocker", () => {
  it("allows an active fixed-price for-hire listing", () => {
    expect(buyNowBlocker(gig, "buyer")).toBeNull();
    expect(buyNowBlocker(gig, null)).toBeNull();
  });
  it("refuses hiring posts", () => {
    expect(buyNowBlocker({ ...gig, listing_type: "hiring" }, "buyer")).toMatch(/for-hire/);
  });
  it("refuses inactive listings", () => {
    expect(buyNowBlocker({ ...gig, status: "closed" }, "buyer")).toMatch(/not active/);
  });
  it("refuses non-fixed pricing", () => {
    expect(buyNowBlocker({ ...gig, budget_type: "hourly" }, "buyer")).toMatch(/fixed-price/);
  });
  it("refuses an unpriced listing", () => {
    expect(buyNowBlocker({ ...gig, budget_min: null, budget_max: null }, "buyer")).toMatch(/no price/);
  });
  it("refuses the seller buying their own listing", () => {
    expect(buyNowBlocker(gig, "seller")).toMatch(/your own/);
  });
});

describe("pricing", () => {
  it("falls back to budget_max", () => {
    expect(listingPrice({ ...gig, budget_min: null, budget_max: 80 })).toBe(80);
  });
  it("prices USD listings as-is", async () => {
    expect(await listingPriceUsd(gig)).toMatchObject({ ok: true, usd: 50, nativeUnit: "USD" });
  });
  it("converts sats listings at the BTC rate", async () => {
    const res = await listingPriceUsd({ ...gig, payment_coin: "SATS", budget_min: 50_000 });
    expect(res).toMatchObject({ ok: true, usd: 50, nativeUnit: "sats", btcUsd: 100_000 });
  });
  it("takes a 5% fee", () => {
    expect(BUY_NOW_FEE_PERCENT).toBe(5);
    expect(orderFeeUsd(50)).toBe(2.5);
  });
});
