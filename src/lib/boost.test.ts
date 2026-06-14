import { describe, it, expect } from "vitest";
import { getBoostEligibility, isGigBoosted, BOOST_COOLDOWN_DAYS } from "./boost";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date("2026-06-14T00:00:00.000Z");

function daysAgo(days: number): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

describe("getBoostEligibility", () => {
  it("is not eligible when created less than the cooldown ago", () => {
    const result = getBoostEligibility({ created_at: daysAgo(3) }, now);
    expect(result.eligible).toBe(false);
    expect(result.nextEligibleAt).not.toBeNull();
  });

  it("is eligible once the cooldown has elapsed since creation", () => {
    const result = getBoostEligibility({ created_at: daysAgo(BOOST_COOLDOWN_DAYS) }, now);
    expect(result.eligible).toBe(true);
    expect(result.nextEligibleAt).toBeNull();
  });

  it("is eligible well past the cooldown", () => {
    const result = getBoostEligibility({ created_at: daysAgo(30) }, now);
    expect(result.eligible).toBe(true);
  });

  it("uses the last boost time, not creation, for the cooldown", () => {
    const result = getBoostEligibility(
      { created_at: daysAgo(30), boosted_at: daysAgo(2) },
      now
    );
    expect(result.eligible).toBe(false);
  });

  it("becomes eligible again a cooldown after the last boost", () => {
    const result = getBoostEligibility(
      { created_at: daysAgo(30), boosted_at: daysAgo(BOOST_COOLDOWN_DAYS) },
      now
    );
    expect(result.eligible).toBe(true);
  });

  it("reports the next eligible time as one cooldown after the reference", () => {
    const result = getBoostEligibility({ created_at: daysAgo(1) }, now);
    expect(result.nextEligibleAt).toBe(
      new Date(now.getTime() + (BOOST_COOLDOWN_DAYS - 1) * DAY_MS).toISOString()
    );
  });

  it("treats gigs with no timestamps as eligible rather than locked", () => {
    expect(getBoostEligibility({}, now).eligible).toBe(true);
    expect(getBoostEligibility({ created_at: "not-a-date" }, now).eligible).toBe(true);
  });
});

describe("isGigBoosted", () => {
  it("is false when never boosted", () => {
    expect(isGigBoosted({ boosted_at: null }, now)).toBe(false);
    expect(isGigBoosted({}, now)).toBe(false);
  });

  it("is true within the active window", () => {
    expect(isGigBoosted({ boosted_at: daysAgo(0) }, now)).toBe(true);
    expect(isGigBoosted({ boosted_at: daysAgo(BOOST_COOLDOWN_DAYS - 1) }, now)).toBe(true);
  });

  it("is false once the active window has elapsed", () => {
    expect(isGigBoosted({ boosted_at: daysAgo(BOOST_COOLDOWN_DAYS) }, now)).toBe(false);
    expect(isGigBoosted({ boosted_at: daysAgo(30) }, now)).toBe(false);
  });

  it("is false for an unparseable timestamp", () => {
    expect(isGigBoosted({ boosted_at: "nope" }, now)).toBe(false);
  });
});
