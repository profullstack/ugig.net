import { describe, it, expect, vi } from "vitest";
import { fetchAllRows } from "./fetch-all";

describe("fetchAllRows", () => {
  it("keeps paging until a short page", async () => {
    const all = Array.from({ length: 25 }, (_, i) => i);
    const page = vi.fn(async (from: number, to: number) => ({ data: all.slice(from, to + 1), error: null }));
    const rows = await fetchAllRows(page, 10);
    expect(rows).toEqual(all);
    expect(page.mock.calls).toEqual([[0, 9], [10, 19], [20, 29]]);
  });

  it("makes one extra call when the last page is exactly full", async () => {
    const all = Array.from({ length: 20 }, (_, i) => i);
    const page = vi.fn(async (from: number, to: number) => ({ data: all.slice(from, to + 1), error: null }));
    expect(await fetchAllRows(page, 10)).toHaveLength(20);
    expect(page).toHaveBeenCalledTimes(3);
  });

  it("throws on a query error instead of returning a partial count", async () => {
    const page = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    await expect(fetchAllRows(page)).rejects.toThrow("boom");
  });
});
