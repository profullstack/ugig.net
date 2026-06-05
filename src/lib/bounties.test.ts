import { describe, expect, it } from "vitest";
import { formatBountyPayout } from "./bounties";

describe("formatBountyPayout", () => {
  it("keeps USD-only bounties unchanged", () => {
    expect(formatBountyPayout(1, null)).toBe("$1 USD");
    expect(formatBountyPayout("12.5", undefined)).toBe("$12.5 USD");
  });

  it("makes coin-paid USD bounties unambiguous", () => {
    expect(formatBountyPayout(1, "SOL")).toBe(
      "$1 USD value, paid in SOL equivalent"
    );
  });

  it("ignores blank payment coin values", () => {
    expect(formatBountyPayout(5, "  ")).toBe("$5 USD");
  });
});
