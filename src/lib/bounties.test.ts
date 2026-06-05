import { describe, it, expect } from "vitest";
import { formatBountyPayout } from "./bounties";

describe("formatBountyPayout", () => {
  it("shows USD only when no coin", () => {
    expect(formatBountyPayout(1, null)).toBe("$1.00 USD");
    expect(formatBountyPayout(100, undefined)).toBe("$100.00 USD");
  });

  it("shows (COIN) format to avoid misreading USD value as coin amount", () => {
    expect(formatBountyPayout(1, "SOL")).toBe("$1.00 USD (SOL)");
    expect(formatBountyPayout(50, "ETH")).toBe("$50.00 USD (ETH)");
  });

  it("handles string amount input", () => {
    expect(formatBountyPayout("2.50", "BTC")).toBe("$2.50 USD (BTC)");
  });
});