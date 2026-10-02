// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// The crawl gateway and the site-wide meter are tested on their own; here
// they let everything through so the polling path is what is exercised.
vi.mock("@/lib/crawl-gateway", () => ({ gate: vi.fn(async () => undefined) }));
vi.mock("@/lib/throttle", () => ({ meter: vi.fn(async () => undefined) }));

// In production updateSession hands back NextResponse.next(): a response with
// NO body, which only tells Next to carry on to the route handler. That is the
// whole bug -- the proxy never sees what the route answers.
vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: vi.fn(async () => NextResponse.next()),
}));

let ipCounter = 0;

function get(path: string, ip: string, cookie?: string) {
  const headers: Record<string, string> = { "x-forwarded-for": ip };
  if (cookie) headers.cookie = cookie;
  return new NextRequest(`https://ugig.net${path}`, { method: "GET", headers });
}

/** A response the proxy produced itself, rather than passing on to the route. */
function answeredByProxy(res: Response): boolean {
  return res.headers.get("x-middleware-next") !== "1";
}

describe("proxy polling throttle", () => {
  let proxy: typeof import("./proxy").proxy;
  let ip: string;

  beforeEach(async () => {
    vi.resetModules();
    ({ proxy } = await import("./proxy"));
    ip = `10.9.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;
  });

  const POLLED = [
    "/api/funding/total",
    "/api/notifications",
    "/api/wallet/balance",
    "/api/wallet/transactions",
  ];

  for (const path of POLLED) {
    it(`never answers a repeat poll of ${path} with an empty 200`, async () => {
      const first = await proxy(get(path, ip));
      expect(answeredByProxy(first)).toBe(false);

      const second = await proxy(get(path, ip));
      if (answeredByProxy(second)) {
        // If the proxy ever answers on its own, it must not be a blank 200.
        const body = await second.text();
        expect(second.status === 200 && body.length === 0).toBe(false);
      }
    });

    it(`passes a repeat poll of ${path} on to the route`, async () => {
      await proxy(get(path, ip));
      const second = await proxy(get(path, ip));
      expect(answeredByProxy(second)).toBe(false);
      expect(second.headers.get("x-throttled")).toBeNull();
    });
  }

  it("never replays one caller's poll to another caller on the same IP", async () => {
    await proxy(get("/api/wallet/balance", ip, "sb-x-auth-token=alice"));
    const bob = await proxy(get("/api/wallet/balance", ip, "sb-x-auth-token=bob"));
    expect(answeredByProxy(bob)).toBe(false);
  });

  it("still blocks an IP that has polled continuously for over 8 hours", async () => {
    vi.useFakeTimers();
    try {
      const start = Date.now();
      // One poll every 20 minutes keeps the tracker alive (cooldown is 30 min).
      for (let t = 0; t <= 8 * 60 + 20; t += 20) {
        vi.setSystemTime(start + t * 60_000);
        await proxy(get("/api/notifications", ip));
      }
      const res = await proxy(get("/api/notifications", ip));
      expect(res.status).toBe(429);
      expect(res.headers.get("retry-after")).toBe("1800");
      expect((await res.json()).error).toMatch(/too many requests/i);
    } finally {
      vi.useRealTimers();
    }
  });
});
