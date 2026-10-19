import { describe, it, expect } from "vitest";
import { isPricedPaymentCoin, PRICED_PAYMENT_COINS } from "./payment-coin";
import { checkGigListing } from "@/lib/gig-listing-check";

describe("isPricedPaymentCoin", () => {
  it.each(["SOL", "ETH", "USDC", "USDT", "POL", "SATS", "LN", "BTC", "usdc_sol", "USDC_POL", "usd", "", null, undefined])(
    "accepts %s",
    (coin) => expect(isPricedPaymentCoin(coin)).toBe(true)
  );

  it.each(["RTC", "PEPE", "MYTOKEN", "credits"])("refuses %s", (coin) =>
    expect(isPricedPaymentCoin(coin)).toBe(false)
  );

  it("lists what it accepts for the error body", () => {
    expect(PRICED_PAYMENT_COINS).toContain("USDC_SOL");
    expect(PRICED_PAYMENT_COINS).not.toContain("RTC");
  });
});

describe("checkGigListing payment coin", () => {
  const base = { title: "Need a Python scraper", description: "Scrape 3 sites into CSV, paying on delivery." };

  it("refuses a hiring post paying only in an unpriced token", () => {
    const v = checkGigListing({ ...base, listingType: "hiring", paymentCoin: "RTC" });
    expect(v).toMatchObject({ ok: false, code: "unpriced_payment_coin", status: 400 });
  });

  it("accepts USD (blank) and listed coins", () => {
    expect(checkGigListing({ ...base, listingType: "hiring", paymentCoin: null }).ok).toBe(true);
    expect(checkGigListing({ ...base, listingType: "hiring", paymentCoin: "usdc_sol" }).ok).toBe(true);
  });

  it("does not judge a for-hire seller's own asking currency", () => {
    expect(checkGigListing({ ...base, listingType: "for_hire", paymentCoin: "RTC" }).ok).toBe(true);
  });

  it("skips the check when the coin is not being changed", () => {
    expect(checkGigListing({ ...base, listingType: "hiring" }).ok).toBe(true);
  });
});
