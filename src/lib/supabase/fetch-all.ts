/**
 * Read every row of a query, a page at a time.
 *
 * PostgREST caps a response at PGRST_DB_MAX_ROWS (1000 on dev2) and returns
 * the first page without saying it truncated, so a count built from a single
 * select silently stops at 1000. `page(from, to)` must return the query with
 * `.range(from, to)` applied (and a stable `.order()`).
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
}
