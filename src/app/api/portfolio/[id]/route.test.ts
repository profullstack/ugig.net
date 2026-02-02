import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PUT, DELETE } from "./route";

// ── Mocks ──────────────────────────────────────────────────────────

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
  const url = "http://localhost/api/portfolio/item-123";
  const init: { method: string; headers?: Record<string, string>; body?: string } = { method };
  if (body) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new NextRequest(url, init);
}

const routeParams = { params: Promise.resolve({ id: "item-123" }) };

/** Build a chainable Supabase query mock that resolves to `result`. */
function chainResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "insert", "update", "delete", "eq", "single", "order"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Terminal methods resolve to the result
  (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  (chain.order as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  return chain;
}

/** Build a delete chain where .eq() is the terminal resolver. */
function makeDeleteChain(result: { error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ["delete", "eq"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  (chain.eq as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  return chain;
}

// ── Setup ──────────────────────────────────────────────────────────

const userId = "user-123";
const authContext = {
  user: { id: userId, email: "test@example.com", authMethod: "session" as const },
  supabase: supabaseClient,
} as unknown as AuthContext;

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════
//  PUT /api/portfolio/[id]
// ════════════════════════════════════════════════════════════════════

describe("PUT /api/portfolio/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await PUT(makeRequest("PUT", { title: "Updated" }), routeParams);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 404 when portfolio item does not exist", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({ data: null, error: null });
    mockFrom.mockReturnValue(ownerChain);

    const res = await PUT(makeRequest("PUT", { title: "Updated" }), routeParams);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Not found");
  });

  it("returns 404 when user does not own the item (enforces ownership)", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({
      data: { id: "item-123", user_id: "other-user-999" },
      error: null,
    });
    mockFrom.mockReturnValue(ownerChain);

    const res = await PUT(makeRequest("PUT", { title: "Updated" }), routeParams);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Not found");
  });

  it("updates portfolio item fields successfully", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({
      data: { id: "item-123", user_id: userId },
      error: null,
    });
    const updatedItem = {
      id: "item-123",
      user_id: userId,
      title: "Updated Title",
      tags: ["new-tag"],
      gig: null,
    };
    const updateChain = chainResult({ data: updatedItem, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? ownerChain : updateChain;
    });

    const res = await PUT(
      makeRequest("PUT", { title: "Updated Title", tags: ["new-tag"] }),
      routeParams,
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.portfolio_item).toEqual(updatedItem);
  });

  it("accepts partial update with only description", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({
      data: { id: "item-123", user_id: userId },
      error: null,
    });
    const updatedItem = {
      id: "item-123",
      description: "New description text",
    };
    const updateChain = chainResult({ data: updatedItem, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? ownerChain : updateChain;
    });

    const res = await PUT(
      makeRequest("PUT", { description: "New description text" }),
      routeParams,
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.portfolio_item).toEqual(updatedItem);
  });

  it("rejects invalid data — title too long", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({
      data: { id: "item-123", user_id: userId },
      error: null,
    });
    mockFrom.mockReturnValue(ownerChain);

    const res = await PUT(
      makeRequest("PUT", { title: "x".repeat(201) }),
      routeParams,
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it("rejects invalid data — empty title", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({
      data: { id: "item-123", user_id: userId },
      error: null,
    });
    mockFrom.mockReturnValue(ownerChain);

    const res = await PUT(
      makeRequest("PUT", { title: "" }),
      routeParams,
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Title is required");
  });

  it("rejects invalid url format", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({
      data: { id: "item-123", user_id: userId },
      error: null,
    });
    mockFrom.mockReturnValue(ownerChain);

    const res = await PUT(
      makeRequest("PUT", { url: "not-a-url" }),
      routeParams,
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it("returns 400 on database error during update", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({
      data: { id: "item-123", user_id: userId },
      error: null,
    });
    const updateChain = chainResult({ data: null, error: { message: "update failed" } });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? ownerChain : updateChain;
    });

    const res = await PUT(
      makeRequest("PUT", { title: "Valid Title" }),
      routeParams,
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("update failed");
  });
});

// ════════════════════════════════════════════════════════════════════
//  DELETE /api/portfolio/[id]
// ════════════════════════════════════════════════════════════════════

describe("DELETE /api/portfolio/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await DELETE(makeRequest("DELETE"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 404 when portfolio item does not exist", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({ data: null, error: null });
    mockFrom.mockReturnValue(ownerChain);

    const res = await DELETE(makeRequest("DELETE"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Not found");
  });

  it("returns 404 when user does not own the item (enforces ownership)", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({
      data: { id: "item-123", user_id: "other-user-999" },
      error: null,
    });
    mockFrom.mockReturnValue(ownerChain);

    const res = await DELETE(makeRequest("DELETE"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Not found");
  });

  it("deletes the portfolio item when owner is authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({
      data: { id: "item-123", user_id: userId },
      error: null,
    });
    const delChain = makeDeleteChain({ error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? ownerChain : delChain;
    });

    const res = await DELETE(makeRequest("DELETE"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it("returns 400 on database error during delete", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({
      data: { id: "item-123", user_id: userId },
      error: null,
    });
    const delChain = makeDeleteChain({ error: { message: "delete failed" } });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? ownerChain : delChain;
    });

    const res = await DELETE(makeRequest("DELETE"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("delete failed");
  });
});
