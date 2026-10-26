import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it.each([
    "/dashboard",
    "/checkout?plan=annual",
    "/dashboard?tab=applications#top",
    "/settings/connections",
    "/u/some-user/posts?page=2",
    "/search?q=a%2Bb",
  ])("keeps same-site path %s", (path) => {
    expect(safeRedirectPath(path, "/fallback")).toBe(path);
  });

  it.each([
    // the audit bypass list
    "//evil.example",
    "/%09/evil.example",
    "/%5Cevil.example",
    "/%5cevil.example",
    "https://evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
    "/%0A/evil.example",
    "/%0D/evil.example",
    "/%0d%0a/evil.example",
    "/%2F/evil.example",
    "/%2f%2fevil.example",
    "%2F%2Fevil.example",
    "\\\\evil.example",
    "\\evil.example",
    "/x\\y",
    " /evil.example",
    "/ /evil.example",
    "/%20/evil.example",
    "/\u0000/evil.example",
    "/%00/evil.example",
    "/\u007f/evil.example",
    "/%25%30%39/evil.example",
    // schemes and host-like values
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,hi",
    "http:evil.example",
    "@evil.example",
    "evil.example",
    // malformed or empty
    "/%E0%A4%A",
    "",
    "/" + "a".repeat(3000),
  ])("rejects %j", (bad) => {
    expect(safeRedirectPath(bad, "/dashboard")).toBe("/dashboard");
  });

  it("returns null without a fallback and handles null/undefined", () => {
    expect(safeRedirectPath("//evil.example")).toBeNull();
    expect(safeRedirectPath(null)).toBeNull();
    expect(safeRedirectPath(undefined, "/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath(42 as unknown as string, "/dashboard")).toBe("/dashboard");
  });
});
