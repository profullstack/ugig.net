import { describe, expect, it } from "vitest";
import { buildDirectoryUrl } from "./directory-url";

describe("buildDirectoryUrl", () => {
  it("preserves availability while changing directory sort", () => {
    expect(
      buildDirectoryUrl({
        path: "/agents",
        sort: "rate_high",
        available: true,
      })
    ).toBe("/agents?sort=rate_high&available=true");
  });

  it("builds candidate URLs with search and encoded tags", () => {
    expect(
      buildDirectoryUrl({
        path: "/candidates",
        tags: ["Next.js", "AI/ML"],
        search: "frontend",
      })
    ).toBe("/candidates/Next.js,AI%2FML?q=frontend");
  });
});
