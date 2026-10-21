import { describe, it, expect } from "vitest";
import { paymentMetadata, toCheckoutCoins } from "./pro-checkout";

describe("toCheckoutCoins", () => {
  it("lists every active coin with a wallet, stablecoins first, deduped", () => {
    const coins = toCheckoutCoins([
      { symbol: "BTC", name: "Bitcoin", is_active: true, has_wallet: true },
      { symbol: "USDC_BASE", name: "USD Coin (Base)", is_active: true, has_wallet: true },
      { symbol: "DOGE", name: "Dogecoin", is_active: true, has_wallet: true },
      { symbol: "XRP", name: "XRP", is_active: false, has_wallet: true },
      { symbol: "ADA", name: "Cardano", is_active: true, has_wallet: false },
      { symbol: "usdt-pol", name: "Tether (Polygon)" },
      { symbol: "BTC", name: "Bitcoin again" },
    ]);
    expect(coins.map((c) => c.value)).toEqual(["usdc_base", "usdt_pol", "btc", "doge"]);
    expect(coins[0].label).toBe("USD Coin (Base)");
  });
});

describe("paymentMetadata", () => {
  it("identifies the property and the account on every payment", () => {
    expect(
      paymentMetadata(
        { userId: "u1", email: "a@example.com", username: "alice" },
        { ugig_payment_id: "p1", type: "subscription", plan: "monthly", rail: "crypto" }
      )
    ).toEqual({
      property: "ugig.net",
      user_id: "u1",
      username: "alice",
      email: "a@example.com",
      ugig_payment_id: "p1",
      type: "subscription",
      plan: "monthly",
      rail: "crypto",
    });
  });
});
