// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const inMock = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({ in: () => ({ not: inMock }) }),
    }),
  }),
}));

describe("GET /api/funding/total", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.resetModules();
    inMock.mockReset();
    ({ GET } = await import("./route"));
  });

  it("returns the summed total with a body", async () => {
    inMock.mockResolvedValue({
      data: [
        { amount_usd: "10.5", user_id: "u1", contributor_email: null },
        { amount_usd: 5, user_id: null, contributor_email: "a@b.c" },
      ],
      error: null,
    });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ total_usd: 15.5, contributors: 2 });
  });

  it("answers a repeat call inside 30s from memory, with the same body", async () => {
    inMock.mockResolvedValue({ data: [{ amount_usd: 7, user_id: "u1" }], error: null });
    const first = await (await GET()).json();
    const second = await GET();
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(first);
    expect(inMock).toHaveBeenCalledTimes(1);
  });

  it("queries again once the memo is older than 30s", async () => {
    vi.useFakeTimers();
    try {
      inMock.mockResolvedValue({ data: [{ amount_usd: 1, user_id: "u1" }], error: null });
      await GET();
      vi.setSystemTime(Date.now() + 31_000);
      inMock.mockResolvedValue({ data: [{ amount_usd: 2, user_id: "u1" }], error: null });
      expect(await (await GET()).json()).toEqual({ total_usd: 2, contributors: 1 });
      expect(inMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not memoise a failed query", async () => {
    inMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    inMock.mockResolvedValueOnce({ data: [{ amount_usd: 3, user_id: "u1" }], error: null });
    await GET();
    expect(await (await GET()).json()).toEqual({ total_usd: 3, contributors: 1 });
  });
});
