import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
let throwOnCreate = false;
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => {
    if (throwOnCreate) throw new Error("Missing Supabase service role configuration");
    return { from: mockFrom };
  }),
}));

import sitemap, * as mod from "./sitemap";

function chain(rows: unknown[]) {
  const calls: { method: string; args: unknown[] }[] = [];
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "not", "order", "limit"]) {
    b[m] = vi.fn((...args: unknown[]) => {
      calls.push({ method: m, args });
      return b;
    });
  }
  b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve);
  return { b, calls };
}

describe("sitemap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    throwOnCreate = false;
  });

  it("renders per request instead of caching a build-time fallback", () => {
    expect((mod as Record<string, unknown>).dynamic).toBe("force-dynamic");
    expect((mod as Record<string, unknown>).revalidate).toBeUndefined();
  });

  it("lists profiles, excluding spam-flagged ones", async () => {
    const chains: Record<string, ReturnType<typeof chain>> = {};
    mockFrom.mockImplementation((table: string) => {
      const rows = table === "profiles" ? [{ username: "alice", updated_at: "2026-10-01T00:00:00Z" }] : [];
      chains[table] = chain(rows);
      return chains[table].b;
    });

    const entries = await sitemap();
    expect(entries.some((e) => e.url.endsWith("/u/alice"))).toBe(true);
    expect(chains.profiles.calls).toContainEqual({ method: "eq", args: ["is_spam", false] });
  });

  it("falls back to static pages when the service client is unavailable", async () => {
    throwOnCreate = true;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const entries = await sitemap();
    expect(entries.length).toBeGreaterThan(10);
    expect(entries.every((e) => !e.url.includes("/u/"))).toBe(true);
    errSpy.mockRestore();
  });
});
