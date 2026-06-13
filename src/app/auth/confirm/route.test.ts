import { describe, expect, it } from "vitest";
import { resolveMagicLinkRedirect } from "./route";

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
  ])("falls back for %s", (_label, next) => {
    expect(resolveMagicLinkRedirect(appUrl, next)).toBe("https://ugig.net/dashboard");
  });

  it("falls back when next is missing", () => {
    expect(resolveMagicLinkRedirect(appUrl, null)).toBe("https://ugig.net/dashboard");
  });
});
