/**
 * Security utilities for sanitizing user input from URL parameters.
 * Prevents reflected XSS by removing or encoding dangerous characters.
 */

/**
 * Sanitize a URL parameter value to prevent XSS attacks.
 * Removes characters that could be used for script injection.
 */
export function sanitizeUrlParam(value: string | null): string {
  if (!value) return "";
  
  // Remove null bytes
  let sanitized = value.replace(/\x00/g, "");
  
  // Remove characters commonly used in XSS attacks
  sanitized = sanitized.replace(/[<>"'`]/g, "");
  
  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, "");
  
  // Remove data: protocol
  sanitized = sanitized.replace(/data:/gi, "");
  
  // Remove vbscript: protocol
  sanitized = sanitized.replace(/vbscript:/gi, "");
  
  // Remove onload/onerror/etc event handlers
  sanitized = sanitized.replace(/\bon\w+\s*=/gi, "");
  
  return sanitized;
}

/**
 * Sanitize multiple URL search parameters from a URL object.
 * Returns a sanitized copy of the parameter value.
 */
export function sanitizeSearchParams(
  url: URL,
  param: string
): string {
  const value = url.searchParams.get(param);
  return sanitizeUrlParam(value);
}

/**
 * Escape user text before interpolating it into a PostgREST filter string.
 * PostgREST uses punctuation such as commas, periods, and parentheses as
 * filter syntax, while SQL LIKE treats % and _ as wildcards. PostgREST also
 * accepts * as a % alias in like/ilike filters.
 */
export function escapePostgrestSearchValue(value: string): string {
  return value.replace(/[\\%*_,().]/g, (char) => `\\${char}`);
}
