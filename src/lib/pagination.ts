const DEFAULT_MAX_PAGE = 1_000;

export function parsePageParam(
  value: string | null | undefined,
  maxPage = DEFAULT_MAX_PAGE
) {
  const raw = value?.trim();
  if (!raw) return 1;

  const parsed = Number(raw);
  return Number.isFinite(parsed)
    ? Math.min(Math.max(Math.trunc(parsed), 1), maxPage)
    : 1;
}
