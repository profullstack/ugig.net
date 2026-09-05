import { createGateway } from "@profullstack/x402-gateway";
import { x402Proxy } from "@profullstack/x402-gateway/next";
import { getAppUrl } from "@/lib/app-url";

/**
 * Sells crawl access to AI training crawlers (GPTBot, ClaudeBot, CCBot,
 * meta-externalagent, Bytespider, Applebot-Extended, ...) by the day over
 * x402, settled by CoinPay in USDC. People, Googlebot and the retrieval
 * crawlers behind AI search (OAI-SearchBot, Claude-SearchBot, PerplexityBot,
 * ...) pass through untouched.
 *
 * Crawlers that do not say who they are are handled two ways: a hosting
 * fleet's address ranges are refused outright (403), and a request that
 * claims "Chrome/..." without the Sec-Fetch-Mode header every Chromium sends
 * is charged like a declared crawler. A signed-in visitor is never charged.
 *
 * Runs inside proxy.ts, so nothing here may import Node-only modules.
 * Without COINPAY_X402_KEY and CRAWL_PAY_TO the gateway still answers
 * training crawlers with 402, just with an empty offer: nothing is sold, but
 * nothing is given away either.
 */

/**
 * OVH VPS fleet ranges, measured 2026-08-28 on rssamplifier: vps-*.vps.ovh.net
 * hosts crawling with a spoofed "Chrome/148" user agent. Nobody reads ugig
 * from an OVH VPS; refused before anything else with a tiny 403.
 */
const OVH_VPS_CIDRS = [
  "51.38.0.0/16",
  "54.38.0.0/16",
  "141.94.0.0/16",
  "145.239.0.0/16",
  "149.202.0.0/16",
  "151.80.0.0/16",
  "57.129.0.0/16",
  "213.32.0.0/16",
];

/**
 * A Supabase session cookie as @supabase/ssr names it (the app's Supabase
 * middleware passes no cookieOptions.name): `sb-<project-ref>-auth-token`,
 * chunked as `sb-<ref>-auth-token.0`, `.1`, ... when the session is large.
 * The `-auth-token-code-verifier` cookie set before sign-in completes does
 * not match, so an unfinished login is not a session.
 */
const SUPABASE_SESSION_COOKIE = /(?:^|;\s*)sb-[^=;]*-auth-token(?:\.\d+)?=/;

/** Whether the request carries a signed-in Supabase session. */
export function hasSupabaseSession(request: Request): boolean {
  const cookie = request.headers.get("cookie");
  return cookie !== null && SUPABASE_SESSION_COOKIE.test(cookie);
}

export const gateway = createGateway({
  siteUrl: getAppUrl(),
  siteName: "ugig",
  coinpay: { apiKey: process.env.COINPAY_X402_KEY },
  payTo: process.env.CRAWL_PAY_TO,
  contact: "mailto:support@ugig.net",
  denyCidrs: OVH_VPS_CIDRS,
  // A "Chrome/..." UA without Sec-Fetch-Mode is an HTTP client with a copied
  // string. Declared bots (Googlebot's evergreen UA, Bingbot, "compatible;")
  // are judged by the lists instead, never by this.
  chargeSpoofedBrowsers: true,
  exempt: hasSupabaseSession,
});

/** Resolves to a Response for a refused crawler, or undefined to carry on. */
export const gate = x402Proxy(gateway);
