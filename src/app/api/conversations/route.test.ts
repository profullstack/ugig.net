import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: mocks.getAuthContext,
}));

import { POST } from "./route";

const ME = "00000000-0000-4000-a000-00000000000a";
const THEM = "00000000-0000-4000-a000-00000000000b";
const GIG = "00000000-0000-4000-a000-0000000000f1";
const BROADCAST_CONV = "00000000-0000-4000-a000-0000000000c1";
const GROUP_CONV = "00000000-0000-4000-a000-0000000000c2";
const DIRECT_CONV = "00000000-0000-4000-a000-0000000000c3";
const NEW_CONV = "00000000-0000-4000-a000-0000000000c9";

/**
 * Supabase stub whose `conversations` select resolves with whatever rows the
 * test supplies, ignoring the filters — so a test can prove the route itself
 * rejects an unsuitable row rather than relying on the query to exclude it.
 * `appliedFilters` records what the route asked for.
 */
function makeSupabase(conversationRows: Record<string, unknown>[]) {
  const appliedFilters: { method: string; args: unknown[] }[] = [];
  const inserted: Record<string, unknown>[] = [];

  const client = {
    from(table: string) {
      const chain: Record<string, unknown> = {};

      for (const method of ["select", "eq", "is", "contains", "in", "order"]) {
        chain[method] = (...args: unknown[]) => {
          if (table === "conversations") appliedFilters.push({ method, args });
          return chain;
        };
      }

      chain.single = () => {
        if (table === "profiles") {
          return Promise.resolve({ data: { id: THEM }, error: null });
        }
        if (table === "gigs") {
          return Promise.resolve({
            data: { id: GIG, poster_id: THEM },
            error: null,
          });
        }
        if (table === "applications") {
          return Promise.resolve({ data: { id: "app-1" }, error: null });
        }
        return Promise.resolve({ data: conversationRows[0] ?? null, error: null });
      };

      chain.maybeSingle = chain.single;

      chain.insert = (row: Record<string, unknown>) => {
        inserted.push(row);
        return {
          select: () => ({
            single: () =>
              Promise.resolve({
                data: { id: NEW_CONV, ...row },
                error: null,
              }),
          }),
        };
      };

      chain.then = (resolve: (v: unknown) => void) => {
        const data =
          table === "conversations"
            ? conversationRows
            : table === "applications"
              ? [{ id: "app-1" }]
              : [];
        return Promise.resolve({ data, error: null }).then(resolve);
      };

      return chain;
    },
    __filters: appliedFilters,
    __inserted: inserted,
  };

  return client;
}

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/conversations — direct messages", () => {
  it("does not reuse a broadcast thread that happens to contain both users", async () => {
    // The broadcast thread is gig_id NULL and contains everyone, so a naive
    // `contains(participant_ids, [me, them])` superset match would return it
    // and the DM would land in the group discussion.
    const supabase = makeSupabase([
      {
        id: BROADCAST_CONV,
        gig_id: null,
        is_broadcast: true,
        participant_ids: [ME, THEM, "someone-else", "another-person"],
      },
    ]);
    mocks.getAuthContext.mockResolvedValue({ user: { id: ME }, supabase });

    const res = await POST(makeRequest({ recipient_id: THEM }));
    const body = await res.json();

    expect(body.data.id).not.toBe(BROADCAST_CONV);
    expect(res.status).toBe(201);
    expect(supabase.__inserted).toHaveLength(1);
    expect(supabase.__inserted[0].participant_ids).toEqual([ME, THEM].sort());
  });

  it("excludes broadcast threads in the query itself", async () => {
    const supabase = makeSupabase([]);
    mocks.getAuthContext.mockResolvedValue({ user: { id: ME }, supabase });

    await POST(makeRequest({ recipient_id: THEM }));

    const excludesBroadcast = supabase.__filters.some(
      (f) => f.method === "eq" && f.args[0] === "is_broadcast" && f.args[1] === false
    );
    expect(excludesBroadcast).toBe(true);
  });

  it("does not reuse a larger group thread that contains both users", async () => {
    const supabase = makeSupabase([
      {
        id: GROUP_CONV,
        gig_id: null,
        is_broadcast: false,
        participant_ids: [ME, THEM, "third-wheel"],
      },
    ]);
    mocks.getAuthContext.mockResolvedValue({ user: { id: ME }, supabase });

    const res = await POST(makeRequest({ recipient_id: THEM }));
    const body = await res.json();

    expect(body.data.id).not.toBe(GROUP_CONV);
    expect(res.status).toBe(201);
  });

  it("still reuses a genuine one-to-one thread", async () => {
    const supabase = makeSupabase([
      {
        id: DIRECT_CONV,
        gig_id: null,
        is_broadcast: false,
        participant_ids: [ME, THEM].sort(),
      },
    ]);
    mocks.getAuthContext.mockResolvedValue({ user: { id: ME }, supabase });

    const res = await POST(makeRequest({ recipient_id: THEM }));
    const body = await res.json();

    expect(body.data.id).toBe(DIRECT_CONV);
    expect(supabase.__inserted).toHaveLength(0);
  });
});

describe("POST /api/conversations — gig-scoped", () => {
  it("does not reuse the gig's message-all group thread for a one-to-one", async () => {
    const supabase = makeSupabase([
      {
        id: GROUP_CONV,
        gig_id: GIG,
        is_broadcast: false,
        participant_ids: [ME, THEM, "applicant-2", "applicant-3"],
      },
    ]);
    mocks.getAuthContext.mockResolvedValue({ user: { id: ME }, supabase });

    const res = await POST(makeRequest({ recipient_id: THEM, gig_id: GIG }));
    const body = await res.json();

    expect(body.data.id).not.toBe(GROUP_CONV);
    expect(res.status).toBe(201);
  });

  it("still reuses an existing one-to-one thread for the same gig", async () => {
    const supabase = makeSupabase([
      {
        id: DIRECT_CONV,
        gig_id: GIG,
        is_broadcast: false,
        participant_ids: [ME, THEM].sort(),
      },
    ]);
    mocks.getAuthContext.mockResolvedValue({ user: { id: ME }, supabase });

    const res = await POST(makeRequest({ recipient_id: THEM, gig_id: GIG }));
    const body = await res.json();

    expect(body.data.id).toBe(DIRECT_CONV);
    expect(supabase.__inserted).toHaveLength(0);
  });
});
