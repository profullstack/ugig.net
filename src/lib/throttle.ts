/**
 * The site-wide allowance: a hundred requests a minute, per caller, on every
 * route. Going over is answered 402 with the crawl gateway's offer, not 429.
 *
 * WHY. Nothing here metered a page route. The polling cache below it in
 * proxy.ts is a different tool for a different job -- it serves a repeat
 * poller a cached body so the database is spared, and it only knows about
 * four endpoints. A caller walking the job listings has never been counted at
 * all.
 *
 * That is the shape that failed on coinpayportal on 2026-09-08: a headless
 * browser found a route nobody had listed and walked 19,000 of its URLs a day
 * for two days, declaring nothing, tripping no list. The gate sells to
 * crawlers that say who they are; this sells to the ones that do not.
 *
 * Imports nothing Node-only: the proxy may run at the edge.
 */

import { createThrottle } from '@profullstack/throttle';
import { gateway } from '@/lib/crawl-gateway';

/** The Supabase session cookie, as a bucket key rather than a boolean. */
function sessionKey(request: Request): string | null {
  const cookie = request.headers.get('cookie') ?? '';
  return /(?:^|;\s*)(sb-[^=;]*-auth-token(?:\.\d+)?)=([^;]+)/.exec(cookie)?.[2] ?? null;
}

export const throttle = createThrottle({
  gateway,
  /*
   * A signed-in member gets the larger budget rather than the anonymous one.
   * The gate exempts a session outright -- it is deciding whether to charge a
   * crawler, and a session is good evidence of a person. Here they are still
   * counted, because an unmetered site for anyone willing to sign up first is
   * a worse trade than metering a member generously.
   */
  credentialFrom: (request) =>
    sessionKey(request) ??
    request.headers.get('x-api-key')?.trim() ??
    /^(\S+)\s+(\S+)/.exec(request.headers.get('authorization')?.trim() ?? '')?.[2] ??
    null,
  credential: { limit: 600, ceiling: 1200 },
  rules: [
    /* Sign-in stays address-bucketed, or a guess buys the member budget. */
    { path: '/api/auth/', limit: 10, credential: false },
    /*
     * The polled endpoints are already served from proxy.ts's cache when they
     * repeat inside 30s, so a client with the page open costs the app nothing
     * and should not be refused for keeping it open.
     */
    { path: '/api/wallet/balance', limit: 600 },
    { path: '/api/wallet/transactions', limit: 600 },
    { path: '/api/notifications', limit: 600 },
    { path: '/api/funding/total', limit: 600 },
    /* Payment processors deliver on their own schedule; signature-verified. */
    { path: '/api/webhooks/', limit: 600, credential: false },
  ],
});

/** Resolves to a Response for a caller over the allowance, or undefined. */
export const meter = (request: Request) => throttle.handle(request);
