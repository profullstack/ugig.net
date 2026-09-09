/**
 * The site-wide allowance.
 *
 * Nothing here metered a page route before. The polling cache in proxy.ts is a
 * different tool for a different job -- it serves a repeat poller a cached body
 * so the database is spared -- and it only knows about four endpoints. A
 * caller walking the gig listings had never been counted at all, which is
 * exactly the gap a headless browser walked through on coinpayportal.
 *
 * Tested against the throttle rather than through proxy.ts: importing the
 * proxy pulls in @profullstack/stack, whose dist imports a bare `next/server`
 * that vitest cannot resolve. That is a pre-existing packaging problem and not
 * something this test should be the first to discover.
 */

import { describe, it, expect } from "vitest";
import { meter } from "./throttle";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

function request(path: string, ip: string, headers: Record<string, string> = {}) {
  return new Request(`https://ugig.net${path}`, {
    headers: {
      "user-agent": BROWSER_UA,
      "sec-fetch-mode": "navigate",
      "x-real-ip": ip,
      ...headers,
    },
  });
}

/** How many land before the throttle refuses. Each case needs its own address. */
async function countUntilLimited(
  path: string,
  ip: string,
  attempts: number,
  headers: Record<string, string> = {},
): Promise<number> {
  let allowed = 0;
  for (let i = 0; i < attempts; i++) {
    if (await meter(request(path, ip, headers))) break;
    allowed++;
  }
  return allowed;
}

describe("the site-wide allowance", () => {
  it("meters a page route, which nothing here did before", async () => {
    expect(await countUntilLimited("/gigs/some-listing", "10.7.0.1", 140)).toBe(100);
  });

  it("gives each caller its own allowance", async () => {
    expect(await countUntilLimited("/gigs/some-listing", "10.7.0.2", 5)).toBe(5);
    expect(await countUntilLimited("/gigs/some-listing", "10.7.0.3", 5)).toBe(5);
  });

  it("keeps sign-in address-bucketed however it is credentialed", async () => {
    // Or a brute-force bolts on an Authorization header and buys the member budget.
    const allowed = await countUntilLimited("/api/auth/callback", "10.7.0.4", 40, {
      authorization: "Bearer anything",
    });
    expect(allowed).toBe(10);
  });

  it("lets a polling client keep the page open", async () => {
    // proxy.ts already serves these from its cache when they repeat inside 30s,
    // so a client with the page open costs the app nothing and is not refused.
    expect(await countUntilLimited("/api/notifications", "10.7.0.5", 200)).toBe(200);
  });

  it("gives a signed-in member the larger budget, but still counts them", async () => {
    const session = { cookie: "sb-abcdef-auth-token=eyJhbGciOi.session.value" };
    expect(await countUntilLimited("/gigs/some-listing", "10.7.0.6", 200, session)).toBe(200);
  });
});
