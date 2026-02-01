import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, PUT, DELETE } from "./route";

// ── Mocks ──────────────────────────────────────────────────────────

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockFrom = vi.fn();

const supabaseClient = {
  from: mockFrom,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseClient)),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
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
});

// ════════════════════════════════════════════════════════════════════
//  GET /api/gigs/[id]
// ════════════════════════════════════════════════════════════════════

describe("GET /api/gigs/[id]", () => {
  it("returns a gig when found", async () => {
    const gig = { id: "test-gig-id", title: "Test Gig", views_count: 5 };

    // First .from("gigs") → select chain (the read)
    const selectChain = chainResult({ data: gig, error: null });
    // Second .from("gigs") → update chain (increment views)
    const updateChain = chainResult({ data: null, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? selectChain : updateChain;
    });

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
});
