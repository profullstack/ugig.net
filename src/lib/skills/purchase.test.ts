import { describe, it, expect } from "vitest";
import { getSellerFeeRate, calculateSkillFee } from "./purchase";
import { SKILL_FEE_RATES } from "@/lib/constants";

describe("getSellerFeeRate", () => {
  it("returns 5% for free tier", () => {
    expect(getSellerFeeRate("free")).toBe(SKILL_FEE_RATES.free);
    expect(getSellerFeeRate("free")).toBe(0.05);
  });

  it("returns 2% for pro tier", () => {
    expect(getSellerFeeRate("pro")).toBe(SKILL_FEE_RATES.pro);
    expect(getSellerFeeRate("pro")).toBe(0.02);
  });

  it("gives lifetime sellers the paid-plan rate", () => {
    expect(getSellerFeeRate("lifetime")).toBe(SKILL_FEE_RATES.pro);
  });

  it("defaults to free tier for null/undefined", () => {
    expect(getSellerFeeRate(null)).toBe(0.05);
    expect(getSellerFeeRate(undefined)).toBe(0.05);
  });

  it("defaults to free tier for unknown plans", () => {
    expect(getSellerFeeRate("enterprise")).toBe(0.05);
    expect(getSellerFeeRate("")).toBe(0.05);
  });
});

describe("calculateSkillFee", () => {
  it("calculates 5% fee correctly", () => {
    expect(calculateSkillFee(10000, 0.05)).toBe(500);
  });

  it("calculates 2% fee correctly", () => {
    expect(calculateSkillFee(10000, 0.02)).toBe(200);
  });

  it("floors fractional sats", () => {
    // 333 * 0.05 = 16.65 → 16
    expect(calculateSkillFee(333, 0.05)).toBe(16);
  });

  it("returns 0 for free listings", () => {
    expect(calculateSkillFee(0, 0.05)).toBe(0);
  });

  it("returns 0 for zero fee rate", () => {
    expect(calculateSkillFee(5000, 0)).toBe(0);
  });

  it("handles large amounts", () => {
    // 1M sats * 2% = 20000
    expect(calculateSkillFee(1_000_000, 0.02)).toBe(20_000);
  });
});
