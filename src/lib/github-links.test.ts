import { describe, it, expect } from "vitest";
import { isGitHubPrLink } from "./github-links";

describe("isGitHubPrLink", () => {
  it("accepts a single pull request URL", () => {
    expect(isGitHubPrLink("https://github.com/profullstack/ugig.net/pull/42")).toBe(true);
    expect(isGitHubPrLink("https://github.com/org/repo/pull/1/files")).toBe(true);
    expect(isGitHubPrLink("https://www.github.com/org/repo/pull/7")).toBe(true);
  });

  it("accepts a repo PR search URL (merged PRs by author)", () => {
    expect(
      isGitHubPrLink(
        "https://github.com/profullstack/sh1pt.com/pulls?q=is%3Apr+is%3Amerged+author%3Achovy"
      )
    ).toBe(true);
    expect(isGitHubPrLink("https://github.com/org/repo/pulls")).toBe(true);
  });

  it("accepts the global PR search URL", () => {
    expect(isGitHubPrLink("https://github.com/pulls?q=is%3Apr+is%3Amerged+author%3Achovy")).toBe(
      true
    );
  });

  it("rejects non-GitHub and non-PR URLs", () => {
    expect(isGitHubPrLink("https://gitlab.com/org/repo/-/merge_requests/1")).toBe(false);
    expect(isGitHubPrLink("https://github.com/org/repo")).toBe(false);
    expect(isGitHubPrLink("https://github.com/org/repo/issues/3")).toBe(false);
    expect(isGitHubPrLink("https://evil.com/github.com/org/repo/pull/1")).toBe(false);
    expect(isGitHubPrLink("http://github.com/org/repo/pull/1")).toBe(false);
    expect(isGitHubPrLink("not a url")).toBe(false);
  });
});
