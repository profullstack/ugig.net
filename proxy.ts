import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { gate } from "@/lib/crawl-gateway";

const REDIRECTS: Record<string, string> = {
  // Pages now exist at /api-docs, /cli-docs, /openapi, /employers
};

// ── Polling throttle ─────────────────────────────────────────────
// Endpoints that get polled heavily by clients with the page open.
// Throttle: only let one request through per IP+path every 30s.
// Others get a lightweight cached response (no DB hit).
const THROTTLED_PATHS = [
  "/api/wallet/balance",
  "/api/wallet/transactions",
  "/api/notifications",
  "/api/funding/total",
];
const THROTTLE_WINDOW_MS = 30_000;
const THROTTLE_MAX_ENTRIES = 5_000;
const THROTTLE_MAX_BODY_BYTES = 64 * 1024; // 64 KiB cap per cached body
const throttleMap = new Map<string, { ts: number; body: string }>();

// ── Polling abuse detection ─────────────────────────────────────
// If an IP hits throttled endpoints for >8 hours continuously,
// block them from those endpoints entirely until they stop for 30 min.
const ABUSE_WINDOW_MS = 8 * 60 * 60_000; // 8 hours
const ABUSE_COOLDOWN_MS = 30 * 60_000; // 30 min cooldown
const ABUSE_MAX_ENTRIES = 10_000;
const abuseTracker = new Map<string, { firstSeen: number; lastSeen: number; blocked: boolean }>();

function checkPollingAbuse(ip: string): boolean {
  const now = Date.now();
  const entry = abuseTracker.get(ip);

  if (!entry) {
    abuseTracker.set(ip, { firstSeen: now, lastSeen: now, blocked: false });
    enforceMapCap(abuseTracker, ABUSE_MAX_ENTRIES);
    return false;
  }

  // If blocked, check if cooldown passed
  if (entry.blocked) {
    if (now - entry.lastSeen > ABUSE_COOLDOWN_MS) {
      // Cooldown passed, reset
      abuseTracker.delete(ip);
      return false;
    }
    entry.lastSeen = now;
    return true; // still blocked
  }

  // If gap > 30 min since last request, reset tracking
  if (now - entry.lastSeen > ABUSE_COOLDOWN_MS) {
    abuseTracker.set(ip, { firstSeen: now, lastSeen: now, blocked: false });
    enforceMapCap(abuseTracker, ABUSE_MAX_ENTRIES);
    return false;
  }

  entry.lastSeen = now;

  // If polling for >8 hours continuously, block
  if (now - entry.firstSeen > ABUSE_WINDOW_MS) {
    entry.blocked = true;
    console.log(`[abuse] Blocked polling from ${ip} after 8h continuous`);
    return true;
  }

  return false;
}

// Cleanup stale entries every 60s
let lastThrottleCleanup = Date.now();
function cleanupThrottle() {
  const now = Date.now();
  if (now - lastThrottleCleanup < 60_000) return;
  lastThrottleCleanup = now;
  for (const [key, entry] of throttleMap) {
    if (now - entry.ts > THROTTLE_WINDOW_MS * 2) throttleMap.delete(key);
  }
  // Also clean abuse tracker
  for (const [ip, entry] of abuseTracker) {
    if (now - entry.lastSeen > ABUSE_COOLDOWN_MS * 2) abuseTracker.delete(ip);
  }
}

// Hard cap — drop oldest entries (insertion order) when exceeded.
// Prevents unbounded growth from high-unique-IP traffic (e.g. signup spam).
function enforceMapCap<K, V>(map: Map<K, V>, cap: number) {
  if (map.size <= cap) return;
  const toDrop = map.size - cap;
  const iter = map.keys();
  for (let i = 0; i < toDrop; i++) {
    const { value: k, done } = iter.next();
    if (done) break;
    map.delete(k);
  }
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    (request as unknown as { ip?: string }).ip ||
    "unknown"
  );
}

export async function proxy(request: NextRequest) {
  // Crawl gateway first: AI training crawlers get 402 Payment Required (or
  // the sales page at /crawl) unless they present a paid pass. People,
  // Googlebot and retrieval crawlers fall through to everything below.
  const answer = await gate(request);
  if (answer) return answer;

  const ip = getClientIp(request);
  const method = request.method;
  const path = request.nextUrl.pathname;

  // Block TRACE method — return 405 Method Not Allowed (#66)
  if (method === "TRACE") {
    return new NextResponse(null, {
      status: 405,
      headers: { Allow: "GET, HEAD, POST, PUT, DELETE, PATCH, OPTIONS" },
    });
  }

  // Redirect legacy/broken paths
  const redirect = REDIRECTS[path];
  if (redirect) {
    return NextResponse.redirect(new URL(redirect, request.url), 301);
  }

  // Throttle heavy polling endpoints — 1 request per IP+path per 30s
  if (method === "GET" && THROTTLED_PATHS.includes(path)) {
    cleanupThrottle();

    // Block IPs that poll continuously for >8 hours
    if (checkPollingAbuse(ip)) {
      return new NextResponse(
        JSON.stringify({ error: "Too many requests. Please refresh the page." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "1800",
            "X-Blocked": "polling-abuse",
          },
        },
      );
    }

    const key = `${ip}:${path}`;
    const cached = throttleMap.get(key);
    const now = Date.now();
    if (cached && now - cached.ts < THROTTLE_WINDOW_MS) {
      // Return cached response without hitting the app
      return new NextResponse(cached.body, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Throttled": "true",
          "Cache-Control": "private, max-age=30",
        },
      });
    }
  }

  // Log with real client IP (not proxy IP)
  if (path.startsWith("/api/")) {
    console.log(`[${method}] ${path} — ${ip}`);
  }

  // After the response, cache it for throttled endpoints
  const response = await updateSession(request);

  if (method === "GET" && THROTTLED_PATHS.includes(path) && response.status === 200) {
    try {
      const cloned = response.clone();
      const body = await cloned.text();
      // Skip caching oversized payloads to protect memory
      if (body.length <= THROTTLE_MAX_BODY_BYTES) {
        throttleMap.set(`${ip}:${path}`, { ts: Date.now(), body });
        enforceMapCap(throttleMap, THROTTLE_MAX_ENTRIES);
      }
    } catch {
      // Don't break if we can't cache
    }
  }

  const ref = request.nextUrl.searchParams.get('ref');
  if (ref) {
    response.cookies.set('referral_code', ref, { httpOnly: false, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30, path: '/' });
  }
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - static assets by extension (images, fonts, scripts, media)
     * API routes stay covered on purpose: a training crawler hitting the
     * API gets 402 from the crawl gateway like everywhere else.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff|woff2|ttf|otf|mp3|mp4|webmanifest)$).*)",
  ],
};
