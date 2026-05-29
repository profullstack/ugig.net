const DEFAULT_MAX_PAGE = 1_000;

export function parsePageParam(
  value: string | null | undefined,
  maxPage = DEFAULT_MAX_PAGE
) {
  const parsed = parseInt(value || "1", 10);
  return Number.isFinite(parsed)
    ? Math.min(Math.max(parsed, 1), maxPage)
    : 1;
}
