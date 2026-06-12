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
