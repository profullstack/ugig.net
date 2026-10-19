import { describe, it, expect } from "vitest";
import { formatTrust } from "./gigs.js";

const trust = (over: Record<string, unknown> = {}) => ({
  delivered_count: 0,
  on_time_rate: null,
  new_seller: true,
  verified_poster: false,
  ...over,
});

describe("formatTrust", () => {
  it("for-hire: new seller, delivered, delivered + on time", () => {
    expect(formatTrust({ listing_type: "for_hire", poster: { trust: trust() } })).toBe("New seller");
    expect(
      formatTrust({ listing_type: "for_hire", poster: { trust: trust({ new_seller: false, delivered_count: 4 }) } })
    ).toBe("4 delivered");
    expect(
      formatTrust({
        listing_type: "for_hire",
        poster: { trust: trust({ new_seller: false, delivered_count: 14, on_time_rate: 92 }) },
      })
    ).toBe("14 delivered · 92% on time");
  });

  it("hiring: whether the poster has paid someone", () => {
    expect(formatTrust({ listing_type: "hiring", poster: { trust: trust({ verified_poster: true }) } })).toBe(
      "verified poster"
    );
    expect(formatTrust({ listing_type: "hiring", poster: { trust: trust() } })).toBe("unverified poster");
  });

  it("unknown trust prints a dash", () => {
    expect(formatTrust({ listing_type: "for_hire", poster: {} })).toBe("-");
  });
});
