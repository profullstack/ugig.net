import { describe, it, expect } from "vitest";
import { calculateCommission } from "./commission";

describe("calculateCommission", () => {
  const percentageOffer = {
    commission_rate: 0.20,
    commission_type: "percentage",
    commission_flat_sats: 0,
  };

  const flatOffer = {
    commission_rate: 0,
    commission_type: "flat",
    commission_flat_sats: 500,
  };

  it("calculates percentage commission correctly", () => {
    expect(calculateCommission(percentageOffer, 10000)).toBe(2000);
  });

  it("calculates flat commission correctly", () => {
    expect(calculateCommission(flatOffer, 10000)).toBe(500);
  });

  it("returns 0 for percentage commission with zero amount", () => {
    expect(calculateCommission(percentageOffer, 0)).toBe(0);
  });

  // --- Regression tests for #139: reject non-integer satoshi amounts ---

  it("rejects fractional saleAmountSats (e.g. 100.5)", () => {
    expect(() => calculateCommission(percentageOffer, 100.5)).toThrow(
      "saleAmountSats must be a non-negative integer"
    );
  });

  it("rejects negative saleAmountSats", () => {
    expect(() => calculateCommission(percentageOffer, -1)).toThrow(
      "saleAmountSats must be a non-negative integer"
    );
  });

  it("rejects fractional amount with flat commission", () => {
    expect(() => calculateCommission(flatOffer, 50.75)).toThrow(
      "saleAmountSats must be a non-negative integer"
    );
  });

  it("accepts valid integer satoshi amounts", () => {
    expect(calculateCommission(percentageOffer, 1)).toBe(0); // 0.2 sats → Math.floor → 0
    expect(calculateCommission(percentageOffer, 10000)).toBe(2000);
    expect(calculateCommission(flatOffer, 10000)).toBe(500);
  });
});