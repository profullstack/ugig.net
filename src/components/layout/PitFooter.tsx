/**
 * The pit.world network footer, fetched on the server and rendered as the last
 * thing in <body>. Cached for an hour; any failure (timeout, non-200, odd body)
 * renders nothing so the page never breaks.
 */
const PIT_FOOTER_URL = "https://pit.world/snippets/footer.html?site=ugig.net";

async function fetchPitFooter(): Promise<string | null> {
  try {
    const res = await fetch(PIT_FOOTER_URL, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    return html.includes("data-pit-footer") ? html : null;
  } catch {
    return null;
  }
}

export async function PitFooter() {
  const html = await fetchPitFooter();
  if (!html) return null;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
