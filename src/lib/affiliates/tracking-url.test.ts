import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAffiliateTrackingUrl, getAffiliateBaseUrl } from "./tracking-url";

describe("affiliate tracking URLs", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the current request origin when no app URL is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");

    expect(getAffiliateBaseUrl("http://localhost:3000/api/affiliates/offers/offer-1/affiliates"))
      .toBe("http://localhost:3000");
  });

  it("prefers the configured public app URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://staging.ugig.example");

    expect(getAffiliateBaseUrl("http://localhost:3000/api/affiliates/offers/offer-1/affiliates"))
      .toBe("https://staging.ugig.example");
  });

  it("builds encoded click URLs", () => {
    expect(buildAffiliateTrackingUrl("https://staging.ugig.example", "alice code/1"))
      .toBe("https://staging.ugig.example/api/affiliates/click?ugig_ref=alice+code%2F1");
  });
});
