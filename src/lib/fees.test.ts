import { describe, it, expect } from "vitest";
import { escrowFeeSplit, formatFeeRate, sellerFeeSplit, zapFeeSplit } from "./fees";
import { ESCROW_FEE_RATE, PLATFORM_FEE_RATE, SKILL_FEE_RATES } from "./constants";

describe("fee previews", () => {
  it("formats rates as percentages", () => {
    expect(formatFeeRate(ESCROW_FEE_RATE)).toBe("5%");
    expect(formatFeeRate(PLATFORM_FEE_RATE)).toBe("2%");
    expect(formatFeeRate(0.025)).toBe("2.5%");
  });

  it("zap fee is floor(2%) and comes out of the recipient's share", () => {
    expect(zapFeeSplit(1000)).toEqual({ feeSats: 20, recipientSats: 980 });
    expect(zapFeeSplit(21)).toEqual({ feeSats: 0, recipientSats: 21 });
    expect(zapFeeSplit(99)).toEqual({ feeSats: 1, recipientSats: 98 });
  });

  it("seller fee mirrors the marketplace purchase split", () => {
    expect(sellerFeeSplit(1000, SKILL_FEE_RATES.free)).toEqual({ feeSats: 50, sellerSats: 950 });
    expect(sellerFeeSplit(1000, SKILL_FEE_RATES.pro)).toEqual({ feeSats: 20, sellerSats: 980 });
    expect(sellerFeeSplit(19, SKILL_FEE_RATES.free)).toEqual({ feeSats: 0, sellerSats: 19 });
  });

  it("escrow fee is 5% of the deposit, rounded to the cent or the sat", () => {
    expect(escrowFeeSplit(100)).toEqual({ feeAmount: 5, workerAmount: 95 });
    expect(escrowFeeSplit(33.33)).toEqual({ feeAmount: 1.67, workerAmount: 31.66 });
    expect(escrowFeeSplit(5000, "sats")).toEqual({ feeAmount: 250, workerAmount: 4750 });
  });
});
