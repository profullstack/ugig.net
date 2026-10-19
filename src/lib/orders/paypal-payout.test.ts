import { describe, it, expect } from "vitest";
import { isPaypalEmail, maskEmail, maskOrderPayout, paypalEmailSchema } from "./paypal-payout";

describe("paypal payout helpers", () => {
  it("accepts and normalises a PayPal email", () => {
    expect(paypalEmailSchema.parse("  Lily@Example.COM ")).toBe("lily@example.com");
    expect(isPaypalEmail("lily@example.com")).toBe(true);
    expect(isPaypalEmail("not an email")).toBe(false);
    expect(isPaypalEmail("")).toBe(false);
  });

  it("masks for display to its owner", () => {
    expect(maskEmail("lily-87@ilands.app")).toBe("l***@ilands.app");
    expect(maskEmail("broken")).toBe("***");
  });

  it("hides a PayPal payout email from the buyer but not the seller", () => {
    const order = { seller_id: "s", buyer_id: "b", payout_currency: "paypal", seller_payout_address: "s@x.com" };
    expect(maskOrderPayout(order, "b").seller_payout_address).toBe("PayPal");
    expect(maskOrderPayout(order, "s").seller_payout_address).toBe("s@x.com");
  });

  it("leaves wallet payouts alone", () => {
    const order = { seller_id: "s", payout_currency: "usdc_sol", seller_payout_address: "So1ana" };
    expect(maskOrderPayout(order, "b").seller_payout_address).toBe("So1ana");
  });
});
