import { NextRequest, NextResponse } from "next/server";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory rate limiter store
// For production with multiple instances, replace with Redis
const store = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}, 60_000); // Clean every 60 seconds

export type RateLimitCategory = "auth" | "read" | "write" | "upload";

const LIMITS: Record<RateLimitCategory, { max: number; windowMs: number }> = {
  auth: { max: 10, windowMs: 60_000 },   // 10 per minute
  read: { max: 100, windowMs: 60_000 },  // 100 per minute
  write: { max: 30, windowMs: 60_000 },  // 30 per minute
  upload: { max: 10, windowMs: 60_000 },  // 10 per minute
};

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Check rate limit for a given identifier and category.
 * identifier is typically the user ID or IP address.
 */
export function checkRateLimit(
  identifier: string,
  category: RateLimitCategory
): RateLimitResult {
  const config = LIMITS[category];
  const key = `${category}:${identifier}`;
  const now = Date.now();

  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return {
      allowed: true,
      limit: config.max,
      remaining: config.max - 1,
      resetAt: now + config.windowMs,
    };
  }

  entry.count++;

  if (entry.count > config.max) {
    return {
      allowed: false,
      limit: config.max,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  return {
    allowed: true,
    limit: config.max,
    remaining: config.max - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Add rate limit headers to a response.
 */
export function addRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult
): NextResponse {
  response.headers.set("X-RateLimit-Limit", String(result.limit));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  response.headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
  return response;
}

/**
 * Create a 429 Too Many Requests response with rate limit headers.
 */
export function rateLimitExceeded(result: RateLimitResult): NextResponse {
  const response = NextResponse.json(
    { error: "Too many requests. Please try again later." },
    { status: 429 }
  );
  return addRateLimitHeaders(response, result);
}

/**
 * Get a rate limit identifier from the request.
 * Uses user ID if available, otherwise falls back to IP address.
 */
export function getRateLimitIdentifier(
  request: NextRequest,
  userId?: string
): string {
  if (userId) return userId;
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "anonymous"
  );
}
