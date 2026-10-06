import { describe, it, expect } from "vitest";
import {
  COINPAY_PLAN_PERIOD_MONTHS,
  COINPAY_PLAN_PRICES_USD,
  FREE_MONTHLY_GIG_POSTS,
  FREE_PERKS,
  FUNDING_LIFETIME_THRESHOLD_USD,
  LIFETIME_PRICE_USD,
  PAID_PERKS,
  PLANS,
  PRO_ANNUAL_PRICE_USD,
  PRO_MONTHLY_PRICE_USD,
  formatUsd,
  hasPaidAccess,
  isPaidPlan,
} from "./plans";

// Perks that were advertised but never built. They must not come back.
const REMOVED_PERKS = [
  /featured profile/i,
  /priority support/i,
  /advanced analytics/i,
  /featured (gig|listing|placement)/i,
  /premium placement/i,
  /api access/i,
  /badge/i,
];

describe("plans", () => {
  it("prices Pro at $9/month, $90/year and Lifetime at $100", () => {
    expect(PRO_MONTHLY_PRICE_USD).toBe(9);
    expect(PRO_ANNUAL_PRICE_USD).toBe(90);
    expect(LIFETIME_PRICE_USD).toBe(100);
    expect(COINPAY_PLAN_PRICES_USD).toEqual({ monthly: 9, annual: 90, lifetime: 100 });
    expect(PLANS.pro.monthlyUsd).toBe(9);
    expect(PLANS.pro.annualUsd).toBe(90);
    expect(PLANS.lifetime.oneTimeUsd).toBe(100);
  });

  it("grants 1 month for monthly and 12 for annual", () => {
    expect(COINPAY_PLAN_PERIOD_MONTHS).toEqual({ monthly: 1, annual: 12 });
  });

  it("caps free accounts at 10 posts per month", () => {
    expect(FREE_MONTHLY_GIG_POSTS).toBe(10);
    expect(PLANS.free.postsPerMonth).toBe(10);
    expect(FREE_PERKS.join(" ")).toContain("10 gigs");
  });

  it("funding lifetime threshold is $50", () => {
    expect(FUNDING_LIFETIME_THRESHOLD_USD).toBe(50);
  });

  it("lists only the real paid perks", () => {
    expect(PAID_PERKS).toEqual([
      "Unlimited gig posts",
      "2% marketplace seller fee instead of 5%",
    ]);
    for (const perk of [...PAID_PERKS, ...FREE_PERKS]) {
      for (const removed of REMOVED_PERKS) expect(perk).not.toMatch(removed);
    }
  });

  it("isPaidPlan is true for pro and lifetime only", () => {
    expect(isPaidPlan("pro")).toBe(true);
    expect(isPaidPlan("lifetime")).toBe(true);
    expect(isPaidPlan("free")).toBe(false);
    expect(isPaidPlan(null)).toBe(false);
    expect(isPaidPlan(undefined)).toBe(false);
    expect(isPaidPlan("enterprise")).toBe(false);
  });

  it("hasPaidAccess treats lifetime as always paid and pro as paid while active", () => {
    expect(hasPaidAccess(null)).toBe(false);
    expect(hasPaidAccess({ plan: "free", status: "active" })).toBe(false);
    expect(hasPaidAccess({ plan: "lifetime", status: "active" })).toBe(true);
    expect(hasPaidAccess({ plan: "lifetime", status: "canceled" })).toBe(true);
    expect(hasPaidAccess({ plan: "pro", status: "active" })).toBe(true);
    expect(hasPaidAccess({ plan: "pro", status: "trialing" })).toBe(true);
    expect(hasPaidAccess({ plan: "pro" })).toBe(true);
    expect(hasPaidAccess({ plan: "pro", status: "canceled" })).toBe(false);
    expect(hasPaidAccess({ plan: "pro", status: "incomplete" })).toBe(false);
  });

  it("formats whole-dollar prices without cents", () => {
    expect(formatUsd(9)).toBe("$9");
    expect(formatUsd(100)).toBe("$100");
    expect(formatUsd(9.5)).toBe("$9.50");
  });
});
