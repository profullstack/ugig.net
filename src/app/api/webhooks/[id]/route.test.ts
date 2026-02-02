import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
import { PUT, DELETE } from "./route";

const mockGetAuthContext = vi.mocked(getAuthContext);

// ── Helpers ────────────────────────────────────────────────────────

const webhookId = "wh-test-id";
const routeParams = { params: Promise.resolve({ id: webhookId }) };

function makeRequest(method: string, body?: Record<string, unknown>) {
  const url = `http://localhost/api/webhooks/${webhookId}`;
  const init: {
    method: string;
    headers?: Record<string, string>;
    body?: string;
  } = { method };
  if (body) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new NextRequest(url, init);
}

const userId = "user-123";
const authContext = {
  user: { id: userId, email: "test@example.com", authMethod: "session" as const },
  supabase: supabaseClient,
} as unknown as AuthContext;

/** Build a chainable Supabase query mock. */
function chainResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "single",
    "order",
  ]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single.mockResolvedValue(result);
  chain.eq.mockReturnValue(chain);
  return chain;
}

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════
//  PUT /api/webhooks/[id]
// ════════════════════════════════════════════════════════════════════

describe("PUT /api/webhooks/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await PUT(
      makeRequest("PUT", { url: "https://example.com/hook" }),
      routeParams
    );
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 404 when webhook not found", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({ data: null, error: null });
    mockFrom.mockReturnValue(ownerChain);

    const res = await PUT(
      makeRequest("PUT", { active: false }),
      routeParams
    );
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Webhook not found");
  });

  it("returns 403 when user does not own the webhook", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({
      data: { id: webhookId, user_id: "other-user-999" },
      error: null,
    });
    mockFrom.mockReturnValue(ownerChain);

    const res = await PUT(
      makeRequest("PUT", { active: false }),
      routeParams
    );
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe("Forbidden");
  });

  it("updates url successfully", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({
      data: { id: webhookId, user_id: userId },
      error: null,
    });

    const updatedWebhook = {
      id: webhookId,
      url: "https://new-url.com/hook",
      events: ["application.new"],
      active: true,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-15T00:00:00Z",
    };
    const updateChain = chainResult({ data: updatedWebhook, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? ownerChain : updateChain;
    });

    const res = await PUT(
      makeRequest("PUT", { url: "https://new-url.com/hook" }),
      routeParams
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual(updatedWebhook);
  });

  it("updates events successfully", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({
      data: { id: webhookId, user_id: userId },
      error: null,
    });

    const updatedWebhook = {
      id: webhookId,
      url: "https://example.com/hook",
      events: ["gig.update", "review.new"],
      active: true,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-15T00:00:00Z",
    };
    const updateChain = chainResult({ data: updatedWebhook, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? ownerChain : updateChain;
    });

    const res = await PUT(
      makeRequest("PUT", { events: ["gig.update", "review.new"] }),
      routeParams
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.events).toEqual(["gig.update", "review.new"]);
  });

  it("updates active status successfully", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({
      data: { id: webhookId, user_id: userId },
      error: null,
    });

    const updatedWebhook = {
      id: webhookId,
      url: "https://example.com/hook",
      events: ["application.new"],
      active: false,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-15T00:00:00Z",
    };
    const updateChain = chainResult({ data: updatedWebhook, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? ownerChain : updateChain;
    });

    const res = await PUT(
      makeRequest("PUT", { active: false }),
      routeParams
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.active).toBe(false);
  });

  it("rejects invalid url", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({
      data: { id: webhookId, user_id: userId },
      error: null,
    });
    mockFrom.mockReturnValue(ownerChain);

    const res = await PUT(
      makeRequest("PUT", { url: "not-a-valid-url" }),
      routeParams
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it("rejects invalid event type", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({
      data: { id: webhookId, user_id: userId },
      error: null,
    });
    mockFrom.mockReturnValue(ownerChain);

    const res = await PUT(
      makeRequest("PUT", { events: ["invalid.event"] }),
      routeParams
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it("returns 400 when supabase update fails", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({
      data: { id: webhookId, user_id: userId },
      error: null,
    });
    const updateChain = chainResult({
      data: null,
      error: { message: "Update failed" },
    });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? ownerChain : updateChain;
    });

    const res = await PUT(
      makeRequest("PUT", { active: true }),
      routeParams
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Update failed");
  });
});

// ════════════════════════════════════════════════════════════════════
//  DELETE /api/webhooks/[id]
// ════════════════════════════════════════════════════════════════════

describe("DELETE /api/webhooks/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await DELETE(makeRequest("DELETE"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 404 when webhook not found", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({ data: null, error: null });
    mockFrom.mockReturnValue(ownerChain);

    const res = await DELETE(makeRequest("DELETE"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Webhook not found");
  });

  it("returns 403 when user does not own the webhook", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({
      data: { id: webhookId, user_id: "other-user-999" },
      error: null,
    });
    mockFrom.mockReturnValue(ownerChain);

    const res = await DELETE(makeRequest("DELETE"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe("Forbidden");
  });

  it("deletes webhook when owner is authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({
      data: { id: webhookId, user_id: userId },
      error: null,
    });

    const deleteChain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["delete", "eq"]) {
      deleteChain[m] = vi.fn().mockReturnValue(deleteChain);
    }
    (deleteChain.eq as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: null,
    });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? ownerChain : deleteChain;
    });

    const res = await DELETE(makeRequest("DELETE"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it("returns 400 when supabase delete fails", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const ownerChain = chainResult({
      data: { id: webhookId, user_id: userId },
      error: null,
    });

    const deleteChain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["delete", "eq"]) {
      deleteChain[m] = vi.fn().mockReturnValue(deleteChain);
    }
    (deleteChain.eq as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: { message: "Delete failed" },
    });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? ownerChain : deleteChain;
    });

    const res = await DELETE(makeRequest("DELETE"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Delete failed");
  });
});
