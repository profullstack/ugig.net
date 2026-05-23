const DEFAULT_APP_URL = "https://ugig.net";

type AppUrlOptions = {
  trustedOnly?: boolean;
};

function trimTrailingSlashes(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function getVercelAppUrl(): string | null {
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (!vercelUrl) return null;

  const host = vercelUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return host ? `https://${host}` : null;
}

function isLocalHostname(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
}

function getRequestOrigin(request?: Request, trustedOnly = false): string | null {
  if (!request) return null;

  try {
    const { hostname, origin } = new URL(request.url);
    if (!origin || origin === "undefined") return null;
    if (trustedOnly && !isLocalHostname(hostname)) return null;
    return trimTrailingSlashes(origin);
  } catch {
    return null;
  }
}

export function getAppUrl(request?: Request, options: AppUrlOptions = {}): string {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  if (configuredUrl) return trimTrailingSlashes(configuredUrl);

  const vercelAppUrl = getVercelAppUrl();
  if (vercelAppUrl) return vercelAppUrl;

  return getRequestOrigin(request, options.trustedOnly) || DEFAULT_APP_URL;
}
