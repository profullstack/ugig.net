import { describe, it, expect } from "vitest";

// Test the budget display logic extracted from GigCard
// This tests the formatting logic for sats/lightning amounts

function getBudgetDisplay(gig: {
  budget_type: string;
  budget_min: number | null;
  budget_max: number | null;
  budget_unit: string | null;
  payment_coin: string | null;
}) {
  const unit = gig.budget_unit;
  const min = gig.budget_min;
  const max = gig.budget_max;

  const suffix = (() => {
    switch (gig.budget_type) {
      case "hourly": return "/hr";
      case "daily": return "/day";
      case "weekly": return "/wk";
      case "monthly": return "/mo";
      case "yearly": return "/yr";
      case "per_task": return unit ? `/${unit}` : "/task";
      case "per_unit": return unit ? `/${unit}` : "/unit";
      case "revenue_share": return "% rev share";
      default: return "";
    }
  })();

  const coin = gig.payment_coin;
  const isSats = coin && (coin === "SATS" || coin === "LN" || coin === "BTC");
  const coinNote = coin ? ` (${coin})` : "";

  const fmt = (val: number) => {
    if (isSats) return `${val.toLocaleString()} sats`;
    return `$${val.toLocaleString()} USD`;
  };

  if (gig.budget_type === "revenue_share") {
    if (min && max) return `${min}-${max}${suffix}`;
    if (min) return `${min}${suffix}`;
    if (max) return `up to ${max}${suffix}`;
    return "Rev Share TBD";
  }

  if (min && max) return `${fmt(min)} - ${fmt(max)}${suffix}${!isSats ? coinNote : ""}`;
  if (min) return `${fmt(min)}+${suffix}${!isSats ? coinNote : ""}`;
  if (max) return `up to ${fmt(max)}${suffix}${!isSats ? coinNote : ""}`;
  return gig.budget_type === "fixed" ? "Budget TBD" : "Rate TBD";
}

describe("GigCard budget display with sats/lightning", () => {
  it("shows sats for SATS payment coin (fixed)", () => {
    const result = getBudgetDisplay({
      budget_type: "fixed",
      budget_min: 50000,
      budget_max: 100000,
      budget_unit: null,
      payment_coin: "SATS",
    });
    expect(result).toBe("50,000 sats - 100,000 sats");
  });

  it("shows sats for LN payment coin (fixed)", () => {
    const result = getBudgetDisplay({
      budget_type: "fixed",
      budget_min: 25000,
      budget_max: null,
      budget_unit: null,
      payment_coin: "LN",
    });
    expect(result).toBe("25,000 sats+");
  });

  it("shows sats for BTC payment coin (hourly)", () => {
    const result = getBudgetDisplay({
      budget_type: "hourly",
      budget_min: 5000,
      budget_max: 10000,
      budget_unit: null,
      payment_coin: "BTC",
    });
    expect(result).toBe("5,000 sats - 10,000 sats/hr");
  });

  it("shows USD for ETH payment coin", () => {
    const result = getBudgetDisplay({
      budget_type: "fixed",
      budget_min: 500,
      budget_max: 1000,
      budget_unit: null,
      payment_coin: "ETH",
    });
    expect(result).toBe("$500 USD - $1,000 USD (ETH)");
  });

  it("shows USD with no payment coin", () => {
    const result = getBudgetDisplay({
      budget_type: "fixed",
      budget_min: 500,
      budget_max: null,
      budget_unit: null,
      payment_coin: null,
    });
    expect(result).toBe("$500 USD+");
  });

  it("shows sats per task", () => {
    const result = getBudgetDisplay({
      budget_type: "per_task",
      budget_min: 1000,
      budget_max: 5000,
      budget_unit: "article",
      payment_coin: "SATS",
    });
    expect(result).toBe("1,000 sats - 5,000 sats/article");
  });

  it("shows revenue share unchanged", () => {
    const result = getBudgetDisplay({
      budget_type: "revenue_share",
      budget_min: 10,
      budget_max: 20,
      budget_unit: null,
      payment_coin: "SATS",
    });
    expect(result).toBe("10-20% rev share");
  });

  it("shows Budget TBD when no amounts set", () => {
    const result = getBudgetDisplay({
      budget_type: "fixed",
      budget_min: null,
      budget_max: null,
      budget_unit: null,
      payment_coin: "SATS",
    });
    expect(result).toBe("Budget TBD");
  });

  it("shows Rate TBD for hourly with no amounts", () => {
    const result = getBudgetDisplay({
      budget_type: "hourly",
      budget_min: null,
      budget_max: null,
      budget_unit: null,
      payment_coin: "LN",
    });
    expect(result).toBe("Rate TBD");
  });

  it("does not append coin note for sats coins", () => {
    const result = getBudgetDisplay({
      budget_type: "fixed",
      budget_min: 50000,
      budget_max: null,
      budget_unit: null,
      payment_coin: "SATS",
    });
    expect(result).not.toContain("(SATS)");
    expect(result).toBe("50,000 sats+");
  });

  it("appends coin note for non-sats coins", () => {
    const result = getBudgetDisplay({
      budget_type: "fixed",
      budget_min: 100,
      budget_max: null,
      budget_unit: null,
      payment_coin: "SOL",
    });
    expect(result).toContain("(SOL)");
  });
});
