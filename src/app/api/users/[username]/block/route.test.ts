import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: mocks.getAuthContext,
}));

import { POST, DELETE, GET } from "./route";

const ME = "00000000-0000-4000-a000-00000000000a";
const THEM = "00000000-0000-4000-a000-00000000000b";

/**
 * Supabase stub. `profileId` is what a profiles lookup resolves to, so a test
 * can make the target be the caller themselves. `insertError` drives the
 * user_blocks insert result.
 */
function makeSupabase({
  profileId = THEM,
  insertError = null as { code?: string; message: string } | null,
  existingBlock = null as { id: string } | null,
} = {}) {
  const inserted: Record<string, unknown>[] = [];
  const deleteFilters: { column: string; value: unknown }[] = [];

  const client = {
    from(table: string) {
      const chain: Record<string, unknown> = {};

      chain.select = () => chain;
      chain.order = () => chain;
      chain.eq = (column: string, value: unknown) => {
        if (table === "user_blocks") deleteFilters.push({ column, value });
        return chain;
      };
      chain.single = () =>
        Promise.resolve(
          table === "profiles"
            ? { data: { id: profileId, username: "them" }, error: null }
            : { data: existingBlock, error: null }
        );
      chain.maybeSingle = () =>
        Promise.resolve({ data: existingBlock, error: null });
      chain.insert = (row: Record<string, unknown>) => {
        inserted.push(row);
        return Promise.resolve({ error: insertError });
      };
      chain.delete = () => chain;
      // A delete chain is awaited directly once its filters are applied.
      chain.then = (resolve: (value: unknown) => unknown) =>
        resolve({ error: null });

      return chain;
    },
  };

  return { client, inserted, deleteFilters };
}

function req(body?: unknown) {
  return new NextRequest("http://localhost/api/users/them/block", {
    method: "POST",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const params = Promise.resolve({ username: "them" });

describe("POST /api/users/[username]/block", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unauthenticated caller", async () => {
    mocks.getAuthContext.mockResolvedValue(null);

    const res = await POST(req(), { params });

    expect(res.status).toBe(401);
  });

  it("records the block for the calling user", async () => {
    const { client, inserted } = makeSupabase();
    mocks.getAuthContext.mockResolvedValue({
      user: { id: ME },
      supabase: client,
    });

    const res = await POST(req(), { params });

    expect(res.status).toBe(201);
    expect(inserted).toEqual([
      { blocker_id: ME, blocked_id: THEM, reason: null },
    ]);
  });

  it("stores a trimmed reason when one is given", async () => {
    const { client, inserted } = makeSupabase();
    mocks.getAuthContext.mockResolvedValue({
      user: { id: ME },
      supabase: client,
    });

    await POST(req({ reason: "  spam  " }), { params });

    expect(inserted[0].reason).toBe("spam");
  });

  it("refuses a self-block", async () => {
    const { client, inserted } = makeSupabase({ profileId: ME });
    mocks.getAuthContext.mockResolvedValue({
      user: { id: ME },
      supabase: client,
    });

    const res = await POST(req(), { params });

    expect(res.status).toBe(400);
    expect(inserted).toEqual([]);
  });

  it("treats an already-blocked user as success", async () => {
    const { client } = makeSupabase({
      insertError: { code: "23505", message: "duplicate key" },
    });
    mocks.getAuthContext.mockResolvedValue({
      user: { id: ME },
      supabase: client,
    });

    const res = await POST(req(), { params });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ blocked: true });
  });
});

describe("DELETE /api/users/[username]/block", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes only the caller's own block row", async () => {
    const { client, deleteFilters } = makeSupabase();
    mocks.getAuthContext.mockResolvedValue({
      user: { id: ME },
      supabase: client,
    });

    const res = await DELETE(req(), { params });

    expect(res.status).toBe(200);
    expect(deleteFilters).toEqual([
      { column: "blocker_id", value: ME },
      { column: "blocked_id", value: THEM },
    ]);
  });
});

describe("GET /api/users/[username]/block", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports not blocked for a logged-out visitor", async () => {
    mocks.getAuthContext.mockResolvedValue(null);

    const res = await GET(req(), { params });

    await expect(res.json()).resolves.toEqual({ blocked: false });
  });

  it("reports blocked when a row exists", async () => {
    const { client } = makeSupabase({ existingBlock: { id: "block-1" } });
    mocks.getAuthContext.mockResolvedValue({
      user: { id: ME },
      supabase: client,
    });

    const res = await GET(req(), { params });

    await expect(res.json()).resolves.toEqual({ blocked: true });
  });
});
