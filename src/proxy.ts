import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { gate } from "@/lib/crawl-gateway";
import { meter } from "@/lib/throttle";

const REDIRECTS: Record<string, string> = {
  // Pages now exist at /api-docs, /cli-docs, /openapi, /employers
};

// ── Polled endpoints ─────────────────────────────────────────────
// Endpoints that get polled by clients with the page open. They are NOT
// cached here. A proxy only ever sees NextResponse.next() -- a body-less
// "carry on to the route" signal -- never what the route answers, so the
// body cache that used to live here stored an empty string and handed every
// repeat poll inside 30s an empty 200 (WalletBalance showed "—", the wallet
// page's JSON parse threw, the bell lost its count). It was also keyed by IP
// alone, so had it ever worked it would have replayed one member's wallet and
// notifications to another behind the same NAT. Load is bounded by the
// site-wide meter (src/lib/throttle.ts); /api/funding/total, the one public
// and global endpoint, memoises its own answer in the route.
const POLLED_PATHS = [
  "/api/wallet/balance",
  "/api/wallet/transactions",
  "/api/notifications",
  "/api/funding/total",
];

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
let lastCleanup = Date.now();
function cleanupAbuseTracker() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
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

  // Then the site-wide allowance, which meters every route: 100 requests a
  // minute per caller, and going over is answered 402 with the same offer the
  // gate makes rather than 429. The polling cache further down is a different
  // tool -- it spares the database a repeat poll it already answered -- and it
  // only ever knew about four endpoints. Nothing counted a page route at all.
  const overLimit = await meter(request);
  if (overLimit) return overLimit;

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

  // Polled endpoints: refuse an IP that has polled for >8 hours straight.
  // Everything else goes on to the route, which answers per user.
  if (method === "GET" && POLLED_PATHS.includes(path)) {
    cleanupAbuseTracker();

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
  }

  // Log with real client IP (not proxy IP)
  if (path.startsWith("/api/")) {
    console.log(`[${method}] ${path} — ${ip}`);
  }

  const response = await updateSession(request);

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
