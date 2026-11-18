import { describe, expect, it } from "vitest";
import { resolveMagicLinkRedirect, resolveSignupConfirmRedirect } from "./route";

describe("resolveMagicLinkRedirect", () => {
  const appUrl = "https://ugig.net";

  it("preserves internal paths and query parameters", () => {
    expect(resolveMagicLinkRedirect(appUrl, "/dashboard?tab=applications")).toBe(
      "https://ugig.net/dashboard?tab=applications"
    );
  });

  it.each([
    ["host-like value", "@example.com"],
    ["absolute URL", "https://example.com"],
    ["protocol-relative URL", "//example.com"],
    ["leading backslash", "\\example.com"],
    ["mixed slash URL", "/\\example.com"],
    ["empty string", ""],
    ["encoded tab", "/%09/evil.example"],
    ["literal tab", "/\t/evil.example"],
    ["encoded backslash", "/%5Cevil.example"],
    ["CRLF", "/%0D%0A/evil.example"],
  ])("falls back for %s", (_label, next) => {
    expect(resolveMagicLinkRedirect(appUrl, next)).toBe("https://ugig.net/dashboard");
  });

  it("falls back when next is missing", () => {
    expect(resolveMagicLinkRedirect(appUrl, null)).toBe("https://ugig.net/dashboard");
  });
});

describe("resolveSignupConfirmRedirect", () => {
  const appUrl = "https://ugig.net";

  it("sends a confirmed signup on to a prefilled gig form", () => {
    expect(resolveSignupConfirmRedirect(appUrl, "/gigs/new?utm_source=bufferoverride&prefill=eyJ0IjoiYSJ9")).toBe(
      "https://ugig.net/gigs/new?utm_source=bufferoverride&prefill=eyJ0IjoiYSJ9"
    );
  });

  it.each([null, "", "https://example.com", "//example.com", "/%0D%0A/evil.example"])(
    "falls back to login with the success note for %s",
    (next) => {
      expect(resolveSignupConfirmRedirect(appUrl, next)).toBe("https://ugig.net/login?confirmed=true");
    }
  );
});
