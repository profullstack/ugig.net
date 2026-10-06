import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { PerkList, ProPriceDetails } from "./PlanPricing";
import { PAID_PERKS } from "@/lib/plans";

vi.mock("@/components/layout/Header", () => ({ Header: () => null }));

import ForEmployersPage from "@/app/for-employers/page";

const REMOVED_COPY = [
  /featured profile badge/i,
  /priority support/i,
  /advanced analytics/i,
  /featured gig placement/i,
  /featured listings/i,
  /post unlimited gigs for free/i,
  /\$29/,
  /\$108/,
  /5\.99/,
];

describe("ProPriceDetails", () => {
  it("shows $9/month, $90/year and $100 lifetime, all crypto via CoinPay, never card", () => {
    const { container } = render(<ProPriceDetails />);
    const text = container.textContent || "";
    expect(text).toContain("$9/month");
    expect(text).toContain("Paid in crypto, via CoinPay");
    expect(text).toContain("$90/year");
    expect(text).toContain("$100 one-time");
    expect(text).not.toMatch(/stripe|card/i);
    expect(text).toContain("$50+");
    for (const re of REMOVED_COPY) expect(text).not.toMatch(re);
  });
});

describe("PerkList", () => {
  it("renders leading items then perks", () => {
    const { getAllByRole } = render(<PerkList leading={["Everything in Free"]} perks={PAID_PERKS} />);
    expect(getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Everything in Free",
      ...PAID_PERKS,
    ]);
  });
});

describe("for-employers page", () => {
  it("renders plans.ts prices and none of the removed perks", () => {
    const { container } = render(<ForEmployersPage />);
    const text = container.textContent || "";
    expect(text).toContain("$9/month");
    expect(text).toContain("$90/year");
    expect(text).toContain("Post up to 10 gigs");
    for (const perk of PAID_PERKS) expect(text).toContain(perk);
    for (const re of REMOVED_COPY) expect(text).not.toMatch(re);
  });
});
