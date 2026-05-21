/**
 * Resolve the current deployment's base URL.
 *
 * Priority:
 * 1. NEXT_PUBLIC_APP_URL env var (explicit deployment origin)
 * 2. Request origin (derived from the incoming request URL)
 * 3. Hardcoded fallback "https://ugig.net"
 *
 * In API route handlers the request object is always available,
 * so the origin is derived from `request.url` rather than guessed.
 */
export function getAppUrl(request?: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/+$/, "");

  if (request) {
    try {
      const { origin } = new URL(request.url);
      if (origin && origin !== "undefined") return origin;
    } catch {
      // fall through
    }
  }

  return "https://ugig.net";
}
