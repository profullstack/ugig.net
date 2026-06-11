export interface DirectoryFilterSearchParams {
  q?: string;
  available?: string;
}

const hasText = (value?: string) => Boolean(value?.trim());

export function hasActiveDirectoryFilters(
  queryParams: DirectoryFilterSearchParams,
  tags: string[] = []
) {
  return (
    tags.some(hasText) ||
    hasText(queryParams.q) ||
    queryParams.available === "true"
  );
}
