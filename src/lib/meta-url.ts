/**
 * Resolve a candidate image href (favicon, og:image) against the page URL,
 * keeping it only if it ends up as http(s).
 *
 * A page may declare `<link rel="icon" href="data:,">` to suppress the favicon
 * request. That parses as a perfectly valid URL, so without a scheme check it
 * reaches the directory as a logo and renders as a broken image.
 */
export function toHttpUrl(href: string | null | undefined, base: string): string {
  if (!href || !href.trim()) return "";

  try {
    const resolved = new URL(href.trim(), base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return "";
    return resolved.href;
  } catch {
    return "";
  }
}
