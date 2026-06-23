// Validation for GitHub links attached to invoices: either a single pull
// request or a PR list/search URL (e.g. a repo's merged PRs filtered by
// author: https://github.com/org/repo/pulls?q=is%3Apr+is%3Amerged+author%3Auser).
export function isGitHubPrLink(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || !/^(www\.)?github\.com$/i.test(url.hostname)) {
    return false;
  }
  const path = url.pathname;
  return (
    // A single PR: /owner/repo/pull/123 (optionally /files, #discussion, …)
    /^\/[^/]+\/[^/]+\/pull\/\d+/.test(path) ||
    // A repo's PR list/search: /owner/repo/pulls
    /^\/[^/]+\/[^/]+\/pulls\/?$/.test(path) ||
    // The global PR search: /pulls
    /^\/pulls\/?$/.test(path)
  );
}

export const GITHUB_PR_LINK_HINT =
  "Must be a GitHub pull request URL (…/pull/123) or PR search URL (…/pulls?q=…)";

// Validation for a single GitHub issue URL (…/owner/repo/issues/123). Used to
// link a bounty to the issue it funds. PR URLs are intentionally rejected here —
// PRs live under /pull/ and are validated by isGitHubPrLink above.
const ISSUE_PATH = /^\/([^/]+)\/([^/]+)\/issues\/(\d+)(?:[/#?].*)?$/;

export function isGitHubIssueLink(value: string): boolean {
  return parseGitHubIssueUrl(value) !== null;
}

/**
 * Parse a GitHub issue URL into its coordinates, or null if it isn't one.
 * Accepts trailing path/hash/query segments (e.g. #issuecomment-…).
 */
export function parseGitHubIssueUrl(
  value: string
): { owner: string; repo: string; number: number } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !/^(www\.)?github\.com$/i.test(url.hostname)) {
    return null;
  }
  const match = ISSUE_PATH.exec(url.pathname);
  if (!match) return null;
  return { owner: match[1], repo: match[2], number: Number(match[3]) };
}

export const GITHUB_ISSUE_LINK_HINT =
  "Must be a GitHub issue URL (https://github.com/owner/repo/issues/123)";
