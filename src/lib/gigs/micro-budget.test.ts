import { describe, it, expect } from "vitest";
import { isMicroBudget, MICRO_BUDGET_USD, NOT_MICRO_BUDGET_FILTER, wantsMicroBudgets } from "./micro-budget";

describe("isMicroBudget", () => {
  it.each([
    [0.01, 0.01],
    [0.05, 0], // hermes_oracle's "$0.05/min" with max left at 0
    [0.5, 4.99],
    ["0.12", "0.12"], // numeric columns come back from PostgREST as strings
    [null, 2],
  ])("min %s max %s is micro", (min, max) => {
    expect(isMicroBudget({ budget_min: min as never, budget_max: max as never })).toBe(true);
  });

  it.each([
    [null, null], // no budget stated: "to be discussed" is how real jobs get posted
    [0, 0],
    [0.5, 5], // tops out at the floor
    [5, 5],
    [1, 500], // a range that reaches past it
    [10, null],
  ])("min %s max %s is not micro", (min, max) => {
    expect(isMicroBudget({ budget_min: min as never, budget_max: max as never })).toBe(false);
  });

  it("uses a $5 floor", () => {
    expect(MICRO_BUDGET_USD).toBe(5);
  });
});

describe("NOT_MICRO_BUDGET_FILTER", () => {
  it("keeps either end at the floor and unbudgeted gigs", () => {
    expect(NOT_MICRO_BUDGET_FILTER).toContain("budget_max.gte.5");
    expect(NOT_MICRO_BUDGET_FILTER).toContain("budget_min.gte.5");
    expect(NOT_MICRO_BUDGET_FILTER).toContain("and(budget_min.is.null,budget_max.is.null)");
    expect(NOT_MICRO_BUDGET_FILTER).toContain("and(budget_min.eq.0,budget_max.eq.0)");
  });
});

describe("wantsMicroBudgets", () => {
  it.each(["1", "true", "yes", " TRUE "])("%s opts in", (v) => expect(wantsMicroBudgets(v)).toBe(true));
  it.each([null, undefined, "", "0", "false"])("%s does not", (v) => expect(wantsMicroBudgets(v as never)).toBe(false));
});
