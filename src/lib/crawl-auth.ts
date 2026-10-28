/**
 * The crawl gateway's `authenticate` hook: does this request carry a ugig
 * credential, and is it a real one?
 *
 * WHY. An agent seller reading its own listing, views or orders with its API
 * key was answered with the crawl paywall (2026-10-28: GET /api/gigs/<id>
 * with Chrome/141 and no Sec-Fetch got 402) because the gate judged the user
 * agent before anything knew who was asking. A bogus bearer got the same 402,
 * where "your key is wrong" is the honest answer.
 *
 * It VERIFIES. Exempting a request because an Authorization header is present
 * would let every scraper bolt a fake one on, so a key is checked against the
 * database (an API key), GoTrue (a Supabase access token) or the AgentPass
 * signature, the same checks getAuthContext runs in the route.
 *
 *   true   a valid ugig credential: never charged
 *   false  a credential that is ours and is wrong: answered 401
 *   null   no credential, or one that is not ours (a crawl pass `cp_...`, a
 *          Power Key, Basic auth): the gate's ordinary rules decide
 *
 * A verified credential is kept for a minute so an integration polling with one key does
 * not pay a bcrypt compare twice per request (here and in the route).
 */

const TTL_MS = 60_000;
const MAX_ENTRIES = 5_000;
const verdicts = new Map<string, { ok: boolean; expiresAt: number }>();

const UGIG_KEY = /^ugig_[a-z]+_/i;
/** A Profullstack Power Key (@profullstack/keys `isPowerKey`; its types are not exported). */
const isPowerKey = (token: string) => token.startsWith("pfs_") && token.indexOf(".") > 4;
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

type Kind = "api_key" | "jwt" | "agentpass" | "unknown_bearer";

/** Which of our credentials the request presents, if any. Pure: no I/O. */
export function credentialKind(request: Request): { kind: Kind; value: string } | null {
  const apiKey = request.headers.get("x-api-key")?.trim();
  if (apiKey && UGIG_KEY.test(apiKey)) return { kind: "api_key", value: apiKey };

  const auth = request.headers.get("authorization")?.trim();
  if (!auth) return null;
  if (/^AgentPass\s/i.test(auth)) return { kind: "agentpass", value: auth };

  const scheme = /^(Bearer|ApiKey|Token)\s+(\S+)$/i.exec(auth);
  if (!scheme) return null;
  const token = scheme[2];
  if (UGIG_KEY.test(token)) return { kind: "api_key", value: token };
  if (scheme[1].toLowerCase() !== "bearer") return null;
  // The gateway's own credentials: a crawl pass or a Profullstack Power Key.
  if (token.startsWith("cp_") || isPowerKey(token)) return null;
  if (JWT.test(token)) return { kind: "jwt", value: token };
  return { kind: "unknown_bearer", value: token };
}

async function verify(kind: Kind, value: string): Promise<boolean> {
  switch (kind) {
    case "api_key": {
      const { authenticateApiKey } = await import("@/lib/auth/api-key");
      return Boolean(await authenticateApiKey(null, value));
    }
    case "jwt": {
      const { authenticateWithToken } = await import("@/lib/supabase/service");
      return Boolean(await authenticateWithToken(`Bearer ${value}`));
    }
    case "agentpass": {
      const { authenticateAgentPass } = await import("@/lib/auth/agentpass");
      return Boolean(await authenticateAgentPass(value));
    }
    default:
      // A bearer that is none of ours. The routes would refuse it too.
      return false;
  }
}

export async function authenticateCrawl(request: Request): Promise<boolean | null> {
  const presented = credentialKind(request);
  if (!presented) return null;

  const cacheKey = `${presented.kind}:${presented.value}`;
  const now = Date.now();
  const hit = verdicts.get(cacheKey);
  if (hit && hit.expiresAt > now) return hit.ok;

  // A failed lookup throws out of here and the gateway reads it as "no
  // opinion", never as a pass; only real verdicts are remembered.
  const ok = await verify(presented.kind, presented.value);
  // Only a pass is remembered: a refusal can be a database blip, and a key
  // that was refused once must not stay refused for a minute. AgentPass signs
  // a timestamp, so its header is single-use by design.
  if (ok && presented.kind !== "agentpass") {
    verdicts.set(cacheKey, { ok, expiresAt: now + TTL_MS });
    if (verdicts.size > MAX_ENTRIES) verdicts.delete(verdicts.keys().next().value as string);
  }
  return ok;
}

/** Test seam. */
export function clearCrawlAuthCache() {
  verdicts.clear();
}
