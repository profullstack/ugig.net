import { describe, it, expect } from "vitest";
import { isGitHubPrLink, isGitHubIssueLink, parseGitHubIssueUrl } from "./github-links";

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

describe("isGitHubIssueLink / parseGitHubIssueUrl", () => {
  it("accepts a single issue URL and parses its coordinates", () => {
    expect(isGitHubIssueLink("https://github.com/org/repo/issues/123")).toBe(true);
    expect(parseGitHubIssueUrl("https://github.com/org/repo/issues/123")).toEqual({
      owner: "org",
      repo: "repo",
      number: 123,
    });
  });

  it("accepts trailing fragments/queries", () => {
    expect(
      parseGitHubIssueUrl("https://github.com/org/repo/issues/7#issuecomment-99")
    ).toEqual({ owner: "org", repo: "repo", number: 7 });
    expect(isGitHubIssueLink("https://www.github.com/org/repo/issues/7?foo=bar")).toBe(true);
  });

  it("rejects PRs, non-issue, and non-GitHub URLs", () => {
    expect(isGitHubIssueLink("https://github.com/org/repo/pull/123")).toBe(false);
    expect(isGitHubIssueLink("https://github.com/org/repo")).toBe(false);
    expect(isGitHubIssueLink("https://github.com/org/repo/issues")).toBe(false);
    expect(isGitHubIssueLink("https://gitlab.com/org/repo/issues/1")).toBe(false);
    expect(isGitHubIssueLink("https://evil.com/github.com/org/repo/issues/1")).toBe(false);
    expect(isGitHubIssueLink("http://github.com/org/repo/issues/1")).toBe(false);
    expect(parseGitHubIssueUrl("not a url")).toBeNull();
  });
});
