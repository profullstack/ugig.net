/**
 * Input sanitization utilities for defense-in-depth.
 * Supabase already uses parameterized queries, but these add extra protection.
 */

/**
 * Strip HTML tags from a string to prevent XSS (#50, #47)
 */
export function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "");
}

/**
 * Strip zero-width chars, control chars, and excessive combining chars (#52)
 */
export function stripUnicodeAbuse(str: string): string {
  // Remove zero-width characters
  let result = str.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, "");
  // Remove control characters (except newline, tab, carriage return)
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");
  // Collapse excessive combining diacritical marks (more than 3 in a row)
  result = result.replace(/([\u0300-\u036F\u0489\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]{4,})/g, (m) => m.slice(0, 3));
  return result;
}

/**
 * Sanitize a gig/post title: strip HTML, unicode abuse, and trim (#47, #52)
 */
export function sanitizeTitle(title: string): string {
  return stripUnicodeAbuse(stripHtml(title)).trim();
}

/**
 * Sanitize comment/description content: strip HTML tags (#50)
 */
export function sanitizeContent(content: string): string {
  return stripHtml(content).trim();
}

/**
 * Strip prototype pollution keys from an object (#51)
 */
export function stripProtoPollution(obj: Record<string, unknown>): Record<string, unknown> {
  const dangerous = new Set(["__proto__", "constructor", "prototype"]);
  const cleaned: Record<string, unknown> = { ...obj };
  for (const key of Object.keys(cleaned)) {
    if (dangerous.has(key)) {
      delete cleaned[key];
    } else if (typeof cleaned[key] === "object" && cleaned[key] !== null && !Array.isArray(cleaned[key])) {
      cleaned[key] = stripProtoPollution(cleaned[key] as Record<string, unknown>);
    }
  }
  return cleaned;
}

/**
 * Safely parse JSON body from a request with prototype pollution protection (#46, #51)
 * Returns null if body is empty or invalid.
 */
export async function safeParseBody<T = Record<string, unknown>>(
  request: Request
): Promise<T | null> {
  try {
    const text = await request.text();
    if (!text || text.trim().length === 0) {
      return null;
    }
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    return stripProtoPollution(parsed) as T;
  } catch {
    return null;
  }
}
