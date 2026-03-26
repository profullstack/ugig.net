import { describe, it, expect } from "vitest";
import { formatBudgetAmount, getBudgetCurrencyLabel, SATS_COINS, PAYMENT_COINS } from "./index";

describe("PAYMENT_COINS", () => {
  it("includes BTC, SATS, and LN", () => {
    expect(PAYMENT_COINS).toContain("BTC");
    expect(PAYMENT_COINS).toContain("SATS");
    expect(PAYMENT_COINS).toContain("LN");
  });

  it("includes standard crypto coins", () => {
    expect(PAYMENT_COINS).toContain("SOL");
    expect(PAYMENT_COINS).toContain("ETH");
    expect(PAYMENT_COINS).toContain("USDC");
    expect(PAYMENT_COINS).toContain("USDT");
    expect(PAYMENT_COINS).toContain("POL");
  });
});

describe("SATS_COINS", () => {
  it("includes SATS, LN, and BTC", () => {
    expect(SATS_COINS.has("SATS")).toBe(true);
    expect(SATS_COINS.has("LN")).toBe(true);
    expect(SATS_COINS.has("BTC")).toBe(true);
  });

  it("does not include non-bitcoin coins", () => {
    expect(SATS_COINS.has("ETH")).toBe(false);
    expect(SATS_COINS.has("SOL")).toBe(false);
    expect(SATS_COINS.has("USDC")).toBe(false);
  });
});

describe("formatBudgetAmount", () => {
  it("formats USD amounts with $ prefix", () => {
    expect(formatBudgetAmount(100)).toBe("$100");
    expect(formatBudgetAmount(1500)).toBe("$1,500");
    expect(formatBudgetAmount(99.99)).toBe("$99.99");
  });

  it("formats sats amounts for SATS coin", () => {
    expect(formatBudgetAmount(50000, "SATS")).toBe("50,000 sats");
    expect(formatBudgetAmount(1000000, "SATS")).toBe("1,000,000 sats");
    expect(formatBudgetAmount(100, "SATS")).toBe("100 sats");
  });

  it("formats sats amounts for LN coin", () => {
    expect(formatBudgetAmount(50000, "LN")).toBe("50,000 sats");
    expect(formatBudgetAmount(21000000, "LN")).toBe("21,000,000 sats");
  });

  it("formats sats amounts for BTC coin (large values)", () => {
    expect(formatBudgetAmount(50000, "BTC")).toBe("50,000 sats");
    expect(formatBudgetAmount(100000, "BTC")).toBe("100,000 sats");
  });

  it("formats BTC amounts for small BTC values", () => {
    expect(formatBudgetAmount(0.001, "BTC")).toBe("₿0.001");
    expect(formatBudgetAmount(0.5, "BTC")).toBe("₿0.5");
  });

  it("formats USD amounts for non-sats coins", () => {
    expect(formatBudgetAmount(100, "ETH")).toBe("$100");
    expect(formatBudgetAmount(500, "SOL")).toBe("$500");
    expect(formatBudgetAmount(1000, "USDC")).toBe("$1,000");
  });

  it("formats USD when no coin specified", () => {
    expect(formatBudgetAmount(250)).toBe("$250");
    expect(formatBudgetAmount(250, null)).toBe("$250");
    expect(formatBudgetAmount(250, undefined)).toBe("$250");
  });
});

describe("getBudgetCurrencyLabel", () => {
  it("returns 'sats' for SATS and LN", () => {
    expect(getBudgetCurrencyLabel("SATS")).toBe("sats");
    expect(getBudgetCurrencyLabel("LN")).toBe("sats");
  });

  it("returns coin name for other coins", () => {
    expect(getBudgetCurrencyLabel("BTC")).toBe("BTC");
    expect(getBudgetCurrencyLabel("ETH")).toBe("ETH");
    expect(getBudgetCurrencyLabel("SOL")).toBe("SOL");
  });

  it("returns 'USD' when no coin", () => {
    expect(getBudgetCurrencyLabel()).toBe("USD");
    expect(getBudgetCurrencyLabel(null)).toBe("USD");
    expect(getBudgetCurrencyLabel(undefined)).toBe("USD");
  });
});
