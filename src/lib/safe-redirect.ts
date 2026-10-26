/**
 * The one same-origin check for every post-login / post-auth redirect target
 * (`?redirect=`, `?next=`, OAuth `returnTo`). Returns `input` only when it is a
 * plain same-site path, otherwise `fallback`.
 *
 * Rejected in the raw input and after each round of percent-decoding (up to 3):
 * - anything not starting with a single "/" (absolute URLs, schemes, "@host")
 * - "//host" and "/\host" (protocol-relative; browsers read "\" as "/")
 * - any backslash anywhere
 * - control characters and whitespace, incl. tab/CR/LF: the URL parser strips
 *   them, so "/\t/evil.example" becomes "//evil.example"
 * - anything that does not resolve to the ugig.net origin
 */
const ORIGIN = "https://ugig.net";
const FORBIDDEN = /[\\\s\u0000-\u001f\u007f-\u009f]/;

function isSafePath(path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//") || path.startsWith("/\\")) return false;
  if (FORBIDDEN.test(path)) return false;
  try {
    return new URL(path, ORIGIN).origin === ORIGIN;
  } catch {
    return false;
  }
}

export function safeRedirectPath(input: string | null | undefined, fallback: string): string;
export function safeRedirectPath(input: string | null | undefined, fallback?: null): string | null;
export function safeRedirectPath(
  input: string | null | undefined,
  fallback: string | null = null
): string | null {
  if (typeof input !== "string" || input.length === 0 || input.length > 2048) return fallback;

  let current = input;
  for (let round = 0; round < 4; round++) {
    if (!isSafePath(current)) return fallback;
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      return fallback;
    }
    if (next === current) return input;
    current = next;
  }
  // Still changing after 3 decodes: nobody legitimately nests that deep.
  return fallback;
}
