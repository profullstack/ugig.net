import { describe, it, expect, vi, beforeEach } from "vitest";

// The free post cap (lib/gig-usage) has its own tests; these cover other rules.
vi.mock("@/lib/gig-usage", () => ({
  getGigPostAllowance: vi.fn(async () => ({ allowed: true })),
  recordGigPost: vi.fn(async () => {}),
  GIG_POST_LIMIT_MESSAGE: "limit",
}));
import { NextRequest } from "next/server";
import { GET, PUT, DELETE } from "./route";

// ── Mocks ──────────────────────────────────────────────────────────

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockFrom = vi.fn();

const mockRpc = vi.fn().mockResolvedValue({ error: null });

const supabaseClient = {
  from: mockFrom,
  rpc: mockRpc,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseClient)),
}));

// Service client: per-table queues of results, one shifted per .from() call.
const svcResults: Record<string, unknown[]> = {};
const svcCalls: { table: string; chain: Record<string, ReturnType<typeof vi.fn>> }[] = [];
function svcThenable(result: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {};
  for (const m of ["select", "insert", "eq", "in", "neq", "is"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}
const svcClient = {
  from: vi.fn((table: string) => {
    const queue = svcResults[table] ?? [];
    const result = queue.length > 0 ? queue.shift() : { data: null, error: null, count: 0 };
    const chain = svcThenable(result);
    svcCalls.push({ table, chain: chain as Record<string, ReturnType<typeof vi.fn>> });
    return chain;
  }),
};

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
  createServiceClient: vi.fn(() => svcClient),
}));

const { mockAdActivation } = vi.hoisted(() => ({ mockAdActivation: vi.fn() }));
vi.mock("@/lib/limits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/limits")>()),
  checkForHireAdActivation: mockAdActivation,
}));

import { getAuthContext } from "@/lib/auth/get-user";
import type { AuthContext } from "@/lib/auth/get-user";
const mockGetAuthContext = vi.mocked(getAuthContext);

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(method: string, body?: Record<string, unknown>) {
  const url = "http://localhost/api/gigs/test-gig-id";
  const init: { method: string; headers?: Record<string, string>; body?: string } = { method };
  if (body) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new NextRequest(url, init);
}

const routeParams = { params: Promise.resolve({ id: "test-gig-id" }) };

/** Build a chain-able Supabase query mock that resolves to `result`. */
function chainResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ["select", "update", "delete", "eq", "single"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Terminal – the last `.single()` or `.eq()` should resolve
  (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  (chain.eq as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(svcResults)) delete svcResults[k];
  svcCalls.length = 0;
});

// ════════════════════════════════════════════════════════════════════
//  GET /api/gigs/[id]
// ════════════════════════════════════════════════════════════════════

describe("GET /api/gigs/[id]", () => {
  it("returns a gig when found", async () => {
    const gig = { id: "test-gig-id", title: "Test Gig", views_count: 5 };

    // .from("gigs") → select chain (the read)
    const selectChain = chainResult({ data: gig, error: null });
    mockFrom.mockReturnValue(selectChain);

    // rpc("increment_gig_views") succeeds — no fallback needed
    mockRpc.mockResolvedValue({ error: null });

    const res = await GET(makeRequest("GET"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.gig).toEqual(gig);
  });

  it("returns 404 when gig not found", async () => {
    const selectChain = chainResult({ data: null, error: { message: "not found" } });
    mockFrom.mockReturnValue(selectChain);

    const res = await GET(makeRequest("GET"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Gig not found");
  });
});

// ════════════════════════════════════════════════════════════════════
//  PUT /api/gigs/[id]  — the main focus: partial updates
// ════════════════════════════════════════════════════════════════════

describe("PUT /api/gigs/[id]", () => {
  const userId = "user-123";
  const authContext = {
    user: { id: userId, email: "test@example.com", authMethod: "session" as const },
    supabase: supabaseClient,
  } as unknown as AuthContext;

  function setupOwnershipCheck(posterId: string) {
    const ownerChain = chainResult({
      data: { poster_id: posterId },
      error: null,
    });
    return ownerChain;
  }

  function setupUpdateSuccess(updatedGig: Record<string, unknown>) {
    // Build chain: .update().eq().select().single()
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    const self = chain;
    for (const m of ["update", "eq", "select", "single"]) {
      chain[m] = vi.fn().mockReturnValue(self);
    }
    chain.single.mockResolvedValue({ data: updatedGig, error: null });
    return chain;
  }

  function setupUpdateError(message: string) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    const self = chain;
    for (const m of ["update", "eq", "select", "single"]) {
      chain[m] = vi.fn().mockReturnValue(self);
    }
    chain.single.mockResolvedValue({ data: null, error: { message } });
    return chain;
  }

  // ── Auth ───────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await PUT(
      makeRequest("PUT", { title: "Updated Title That Is Long Enough" }),
      routeParams,
    );
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  // ── Ownership ──────────────────────────────────────────────────

  it("returns 404 when gig does not exist", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({ data: null, error: null });
    mockFrom.mockReturnValue(ownerChain);

    const res = await PUT(
      makeRequest("PUT", { budget_min: 0.05 }),
      routeParams,
    );
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Gig not found");
  });

  it("returns 403 when user does not own the gig", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = setupOwnershipCheck("other-user-999");
    mockFrom.mockReturnValue(ownerChain);

    const res = await PUT(
      makeRequest("PUT", { budget_min: 0.05 }),
      routeParams,
    );
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe("Forbidden");
  });

  // ── Partial updates (the bug fix) ─────────────────────────────

  it("accepts a partial update with only budget fields", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = setupOwnershipCheck(userId);
    const updatedGig = { id: "test-gig-id", budget_min: 0.05, budget_max: 0.10 };
    const updateChain = setupUpdateSuccess(updatedGig);

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? ownerChain : updateChain;
    });

    const res = await PUT(
      makeRequest("PUT", { budget_min: 0.05, budget_max: 0.10 }),
      routeParams,
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.gig).toEqual(updatedGig);
  });

  it("accepts a partial update with only the title", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = setupOwnershipCheck(userId);
    const updatedGig = { id: "test-gig-id", title: "A Shiny New Title For The Gig" };
    const updateChain = setupUpdateSuccess(updatedGig);

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? ownerChain : updateChain;
    });

    const res = await PUT(
      makeRequest("PUT", { title: "A Shiny New Title For The Gig" }),
      routeParams,
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.gig).toEqual(updatedGig);
  });

  it("accepts a partial update with only the status", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = setupOwnershipCheck(userId);
    const updatedGig = { id: "test-gig-id", status: "paused" };
    const updateChain = setupUpdateSuccess(updatedGig);

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? ownerChain : updateChain;
    });

    const res = await PUT(
      makeRequest("PUT", { status: "paused" }),
      routeParams,
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.gig).toEqual(updatedGig);
  });

  // ── Full updates ──────────────────────────────────────────────

  it("accepts a full update with all fields", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const fullBody = {
      title: "Complete Gig Update With All Fields",
      description:
        "This is a fully updated description that meets the minimum character requirement for the gig schema.",
      category: "Development",
      skills_required: ["React", "TypeScript"],
      ai_tools_preferred: ["ChatGPT"],
      budget_type: "hourly" as const,
      budget_min: 50,
      budget_max: 100,
      duration: "2 weeks",
      location_type: "remote" as const,
      location: "Anywhere",
    };

    const ownerChain = setupOwnershipCheck(userId);
    const updatedGig = { id: "test-gig-id", ...fullBody };
    const updateChain = setupUpdateSuccess(updatedGig);

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? ownerChain : updateChain;
    });

    const res = await PUT(makeRequest("PUT", fullBody), routeParams);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.gig).toEqual(updatedGig);
  });

  // ── Validation errors ─────────────────────────────────────────

  it("rejects invalid field values (title too short)", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = setupOwnershipCheck(userId);
    mockFrom.mockReturnValue(ownerChain);

    const res = await PUT(
      makeRequest("PUT", { title: "Short" }),
      routeParams,
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it("rejects invalid budget_type enum value", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = setupOwnershipCheck(userId);
    mockFrom.mockReturnValue(ownerChain);

    const res = await PUT(
      makeRequest("PUT", { budget_type: "invalid_type" }),
      routeParams,
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  // ── DB error handling ─────────────────────────────────────────

  it("returns 400 when supabase update fails", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = setupOwnershipCheck(userId);
    const updateChain = setupUpdateError("Some database error");

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? ownerChain : updateChain;
    });

    const res = await PUT(
      makeRequest("PUT", { budget_min: 0.05 }),
      routeParams,
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Some database error");
  });
});

// ════════════════════════════════════════════════════════════════════
//  DELETE /api/gigs/[id]
// ════════════════════════════════════════════════════════════════════

describe("DELETE /api/gigs/[id]", () => {
  const userId = "user-123";
  const authContext = {
    user: { id: userId, email: "test@example.com", authMethod: "session" as const },
    supabase: supabaseClient,
  } as unknown as AuthContext;

  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await DELETE(makeRequest("DELETE"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 403 when user does not own the gig", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({ data: { poster_id: "other-user" }, error: null });
    mockFrom.mockReturnValue(ownerChain);

    const res = await DELETE(makeRequest("DELETE"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe("Forbidden");
  });

  it("deletes the gig when owner is authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({ data: { poster_id: userId }, error: null });
    const deleteChain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["delete", "eq"]) {
      deleteChain[m] = vi.fn().mockReturnValue(deleteChain);
    }
    (deleteChain.eq as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? ownerChain : deleteChain;
    });

    const res = await DELETE(makeRequest("DELETE"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.message).toBe("Gig deleted successfully");
  });

  function ownerThenDelete(deleteResult: { error: unknown } = { error: null }) {
    const ownerChain = chainResult({ data: { poster_id: userId, title: "Logo design" }, error: null });
    const deleteChain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["delete", "eq"]) {
      deleteChain[m] = vi.fn().mockReturnValue(deleteChain);
    }
    (deleteChain.eq as ReturnType<typeof vi.fn>).mockResolvedValue(deleteResult);
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? ownerChain : deleteChain;
    });
    return deleteChain;
  }

  it("refuses with 409 when the gig has a hired application", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);
    const deleteChain = ownerThenDelete();
    svcResults.applications = [{ count: 1, error: null }];

    const res = await DELETE(makeRequest("DELETE"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/hired/);
    expect(deleteChain.delete).not.toHaveBeenCalled();
    const hiredQuery = svcCalls.find((c) => c.table === "applications")!;
    expect(hiredQuery.chain.in).toHaveBeenCalledWith("status", [
      "accepted",
      "in_progress",
      "completed",
      "paid",
    ]);
    expect(svcCalls.some((c) => c.table === "notifications")).toBe(false);
  });

  it("refuses with 409 when the gig has an unpaid sent invoice", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);
    const deleteChain = ownerThenDelete();
    svcResults.applications = [{ count: 0, error: null }];
    svcResults.gig_invoices = [{ count: 2, error: null }];

    const res = await DELETE(makeRequest("DELETE"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/unpaid invoice/);
    expect(deleteChain.delete).not.toHaveBeenCalled();
    const invoiceQuery = svcCalls.find((c) => c.table === "gig_invoices")!;
    expect(invoiceQuery.chain.eq).toHaveBeenCalledWith("status", "sent");
  });

  it("notifies each open applicant once in-app after deleting", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);
    const deleteChain = ownerThenDelete();
    svcResults.applications = [
      { count: 0, error: null },
      {
        data: [
          { id: "app-1", applicant_id: "applicant-1" },
          { id: "app-2", applicant_id: "applicant-2" },
        ],
        error: null,
      },
    ];
    svcResults.gig_invoices = [{ count: 0, error: null }];
    svcResults.notifications = [{ error: null }];

    const res = await DELETE(makeRequest("DELETE"), routeParams);

    expect(res.status).toBe(200);
    expect(deleteChain.delete).toHaveBeenCalled();
    const openQuery = svcCalls.filter((c) => c.table === "applications")[1];
    expect(openQuery.chain.in).toHaveBeenCalledWith("status", ["pending", "reviewing", "shortlisted"]);
    expect(openQuery.chain.is).toHaveBeenCalledWith("metadata->>held", null);
    const notify = svcCalls.find((c) => c.table === "notifications")!;
    expect(notify.chain.insert).toHaveBeenCalledTimes(1);
    const rows = notify.chain.insert.mock.calls[0][0] as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      user_id: "applicant-1",
      type: "application_status",
      data: { gig_id: "test-gig-id", application_id: "app-1", status: "gig_removed" },
    });
    expect(rows[0].body).toContain("Logo design");
    expect(rows[0].body).toContain("removed");
  });

  it("does not notify anyone when the delete itself fails", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);
    ownerThenDelete({ error: { message: "boom" } });
    svcResults.applications = [
      { count: 0, error: null },
      { data: [{ id: "app-1", applicant_id: "applicant-1" }], error: null },
    ];
    svcResults.gig_invoices = [{ count: 0, error: null }];

    const res = await DELETE(makeRequest("DELETE"), routeParams);

    expect(res.status).toBe(400);
    expect(svcCalls.some((c) => c.table === "notifications")).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════
//  PUT /api/gigs/[id]: activation through the edit form
// ════════════════════════════════════════════════════════════════════

describe("PUT /api/gigs/[id] - expiry and ad caps", () => {
  const authContext = {
    user: { id: "owner-1", authMethod: "session" as const },
    supabase: supabaseClient,
  } as unknown as AuthContext;

  function setup(existing: Record<string, unknown>, updates: Record<string, unknown>[]) {
    let calls = 0;
    mockFrom.mockImplementation(() => {
      calls++;
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      for (const m of ["select", "eq", "update", "single"]) chain[m] = vi.fn(() => chain);
      if (calls === 1) {
        chain.single.mockResolvedValue({ data: existing, error: null });
      } else {
        chain.update.mockImplementation((payload: Record<string, unknown>) => {
          updates.push(payload);
          return chain;
        });
        chain.single.mockResolvedValue({ data: { id: "test-gig-id" }, error: null });
      }
      return chain;
    });
    mockGetAuthContext.mockResolvedValue(authContext);
  }

  const draftAd = { poster_id: "owner-1", status: "draft", listing_type: "for_hire", title: "Logo design" };

  beforeEach(() => {
    mockAdActivation.mockReset();
    mockAdActivation.mockResolvedValue({ ok: true });
  });

  it("publishing an ad runs the ad checks and sets a 60-day expiry", async () => {
    const updates: Record<string, unknown>[] = [];
    setup(draftAd, updates);
    const before = Date.now();

    const res = await PUT(makeRequest("PUT", { status: "active" }), routeParams);
    expect(res.status).toBe(200);
    expect(mockAdActivation).toHaveBeenCalledWith(supabaseClient, "owner-1", "Logo design", "test-gig-id");
    const expires = new Date(updates[0].expires_at as string).getTime();
    expect(Math.abs(expires - before - 60 * 86400_000)).toBeLessThan(5000);
  });

  it("refuses to publish a duplicate ad (409) and does not update", async () => {
    const updates: Record<string, unknown>[] = [];
    setup(draftAd, updates);
    mockAdActivation.mockResolvedValue({ ok: false, status: 409, error: "duplicate" });

    const res = await PUT(makeRequest("PUT", { status: "active" }), routeParams);
    expect(res.status).toBe(409);
    expect(updates).toHaveLength(0);
  });

  it("re-checks a live ad whose title changes, without resetting its expiry", async () => {
    const updates: Record<string, unknown>[] = [];
    setup({ ...draftAd, status: "active" }, updates);

    const res = await PUT(makeRequest("PUT", { title: "A brand new ad title here" }), routeParams);
    expect(res.status).toBe(200);
    expect(mockAdActivation).toHaveBeenCalledWith(
      supabaseClient,
      "owner-1",
      "A brand new ad title here",
      "test-gig-id"
    );
    expect(updates[0]).not.toHaveProperty("expires_at");
  });

  it("does not run the ad checks on a description edit of a live ad", async () => {
    const updates: Record<string, unknown>[] = [];
    setup({ ...draftAd, status: "active" }, updates);

    const res = await PUT(
      makeRequest("PUT", { description: "A longer description that is comfortably over the fifty character minimum." }),
      routeParams
    );
    expect(res.status).toBe(200);
    expect(mockAdActivation).not.toHaveBeenCalled();
  });

  it("publishing a hiring gig sets a 30-day expiry and skips the ad checks", async () => {
    const updates: Record<string, unknown>[] = [];
    setup({ ...draftAd, listing_type: "hiring" }, updates);
    const before = Date.now();

    const res = await PUT(makeRequest("PUT", { status: "active" }), routeParams);
    expect(res.status).toBe(200);
    expect(mockAdActivation).not.toHaveBeenCalled();
    const expires = new Date(updates[0].expires_at as string).getTime();
    expect(Math.abs(expires - before - 30 * 86400_000)).toBeLessThan(5000);
  });
});
