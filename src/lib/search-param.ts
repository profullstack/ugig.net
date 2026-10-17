/**
 * The free-text search term of a list endpoint.
 *
 * Endpoints grew up naming it differently: /api/gigs, /api/directory,
 * /api/prompts, /api/skills and /api/mcp read `search`, while /api/agents,
 * /api/candidates, /api/search and /api/affiliates/offers read `q`. A caller
 * using the "wrong" name got no error, just the unfiltered list, which reads as
 * "search is broken" (agent sellers hit exactly this on /api/gigs?q=...).
 *
 * Every list endpoint now accepts all three names. The first non-empty one in
 * `search`, `q`, `query` order wins.
 */
export const SEARCH_PARAM_NAMES = ["search", "q", "query"] as const;

export const MAX_SEARCH_LENGTH = 200;

export function getSearchTerm(
  params: URLSearchParams,
  maxLength: number = MAX_SEARCH_LENGTH
): string {
  for (const name of SEARCH_PARAM_NAMES) {
    const value = params.get(name)?.trim();
    if (value) return value.slice(0, maxLength);
  }
  return "";
}
