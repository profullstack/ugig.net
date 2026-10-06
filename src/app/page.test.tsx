import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { PAID_PERKS } from "@/lib/plans";

vi.mock("@/components/layout/Header", () => ({ Header: () => null }));
vi.mock("@/components/AdUnit", () => ({ AdUnit: () => null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

import Home from "./page";

describe("landing page pricing", () => {
  it("shows plans.ts prices and perks, and none of the removed perks", async () => {
    const { container } = render(await Home());
    const text = container.textContent || "";
    expect(text).toContain("$9/month");
    expect(text).toContain("$90/year (crypto only, via CoinPay)");
    expect(text).toContain("$100 one-time");
    expect(text).toContain("Post up to 10 gigs per month");
    for (const perk of PAID_PERKS) expect(text).toContain(perk);
    for (const re of [/priority support/i, /featured profile badge/i, /advanced analytics/i, /\$29/]) {
      expect(text).not.toMatch(re);
    }
  });
});
