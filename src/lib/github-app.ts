// Minimal GitHub client for posting/editing a single status comment on the
// GitHub issue a bounty is funding. Zero external dependencies — all calls go
// through fetch against the REST API.
//
// Two auth modes, checked in this order:
//
//   1. GITHUB_TOKEN — a personal access token or `gh auth token` value. Simplest
//      setup: the token already covers every repo the user can write to, so
//      there is no per-repo install. Comments post as that user.
//
//   2. GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY — a GitHub App. The App JWT is
//      signed with node:crypto (RS256); the installation is resolved on demand
//      (GET /repos/{owner}/{repo}/installation) so no installation_id is stored.
//      The App must be installed on the target repo, else the call is skipped.
//
// If neither is configured (or the call fails / the App isn't installed), the
// comment is silently skipped and callers carry on.
import crypto from "crypto";

const API = "https://api.github.com";
const API_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "ugig.net-bounties",
};

export function isGitHubAppConfigured(): boolean {
  return Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY);
}

/** True if any GitHub auth mode (token or App) is configured. */
export function isGitHubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN) || isGitHubAppConfigured();
}

// Resolve a bearer token for REST calls on {owner}/{repo}. Prefers a static
// GITHUB_TOKEN; otherwise mints a short-lived App installation token. Returns
// null if no mode is configured or the App isn't installed on the repo.
async function resolveToken(owner: string, repo: string): Promise<string | null> {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (!isGitHubAppConfigured()) return null;
  return installationToken(owner, repo);
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// A short-lived (10 min) App JWT, signed RS256 with the App private key.
function appJwt(): string {
  const appId = process.env.GITHUB_APP_ID as string;
  const privateKey = (process.env.GITHUB_APP_PRIVATE_KEY as string).replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  // iat back-dated 60s to tolerate clock skew; GitHub caps exp at 10 min.
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }));
  const signature = base64url(
    crypto.createSign("RSA-SHA256").update(`${header}.${payload}`).sign(privateKey)
  );
  return `${header}.${payload}.${signature}`;
}

async function installationToken(owner: string, repo: string): Promise<string | null> {
  const jwt = appJwt();
  const authHeaders = { ...API_HEADERS, Authorization: `Bearer ${jwt}` };

  const instRes = await fetch(`${API}/repos/${owner}/${repo}/installation`, {
    headers: authHeaders,
  });
  if (!instRes.ok) {
    // 404 = App not installed on this repo; anything else is a real error.
    console.warn(`[github-app] no installation for ${owner}/${repo} (${instRes.status})`);
    return null;
  }
  const installation = (await instRes.json()) as { id: number };

  const tokenRes = await fetch(`${API}/app/installations/${installation.id}/access_tokens`, {
    method: "POST",
    headers: authHeaders,
  });
  if (!tokenRes.ok) {
    console.warn(`[github-app] token exchange failed (${tokenRes.status})`);
    return null;
  }
  const { token } = (await tokenRes.json()) as { token: string };
  return token;
}

/**
 * Post a comment on an issue. Returns the new comment id, or null if the App is
 * unconfigured / not installed / the call failed. Never throws — callers treat
 * the comment as best-effort.
 */
export async function postIssueComment(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
): Promise<number | null> {
  if (!isGitHubConfigured()) return null;
  try {
    const token = await resolveToken(owner, repo);
    if (!token) return null;
    const res = await fetch(`${API}/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      method: "POST",
      headers: { ...API_HEADERS, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) {
      console.warn(`[github-app] post comment failed (${res.status})`);
      return null;
    }
    const comment = (await res.json()) as { id: number };
    return comment.id;
  } catch (err) {
    console.warn("[github-app] post comment error:", err);
    return null;
  }
}

/**
 * Edit an existing issue comment in place. Best-effort: returns true on success,
 * false otherwise. Never throws.
 */
export async function updateIssueComment(
  owner: string,
  repo: string,
  commentId: number,
  body: string
): Promise<boolean> {
  if (!isGitHubConfigured()) return false;
  try {
    const token = await resolveToken(owner, repo);
    if (!token) return false;
    const res = await fetch(`${API}/repos/${owner}/${repo}/issues/comments/${commentId}`, {
      method: "PATCH",
      headers: { ...API_HEADERS, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) {
      console.warn(`[github-app] update comment failed (${res.status})`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[github-app] update comment error:", err);
    return false;
  }
}
