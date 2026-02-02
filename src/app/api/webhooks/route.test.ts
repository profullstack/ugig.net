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
import { GET, POST } from "./route";

const mockGetAuthContext = vi.mocked(getAuthContext);

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(method: string, body?: Record<string, unknown>) {
  const url = "http://localhost/api/webhooks";
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

/** Build a chainable Supabase query mock that resolves at terminal methods. */
function chainResult(result: { data: unknown; error: unknown; count?: number | null }) {
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
  // Terminal calls resolve
  chain.single.mockResolvedValue(result);
  // For non-single chains (list queries, count queries), the last .eq / .order resolves
  chain.order.mockResolvedValue(result);
  chain.eq.mockReturnValue(chain);
  // For count/head queries: .select returns the chain, the last .eq resolves with count
  return chain;
}

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════
//  GET /api/webhooks
// ════════════════════════════════════════════════════════════════════

describe("GET /api/webhooks", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await GET(makeRequest("GET"));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns user's webhooks without secret", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const webhooks = [
      {
        id: "wh-1",
        url: "https://example.com/hook1",
        events: ["application.new"],
        active: true,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      },
      {
        id: "wh-2",
        url: "https://example.com/hook2",
        events: ["gig.update", "review.new"],
        active: false,
        created_at: "2025-01-02T00:00:00Z",
        updated_at: "2025-01-02T00:00:00Z",
      },
    ];

    const listChain = chainResult({ data: webhooks, error: null });
    mockFrom.mockReturnValue(listChain);

    const res = await GET(makeRequest("GET"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual(webhooks);
    // Verify select does NOT include 'secret'
    expect(listChain.select).toHaveBeenCalledWith(
      "id, url, events, active, created_at, updated_at"
    );
  });

  it("returns 400 when supabase errors", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const listChain = chainResult({
      data: null,
      error: { message: "DB error" },
    });
    mockFrom.mockReturnValue(listChain);

    const res = await GET(makeRequest("GET"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("DB error");
  });
});

// ════════════════════════════════════════════════════════════════════
//  POST /api/webhooks
// ════════════════════════════════════════════════════════════════════

describe("POST /api/webhooks", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await POST(
      makeRequest("POST", {
        url: "https://example.com/hook",
        events: ["application.new"],
      })
    );
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("validates required url field", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const res = await POST(
      makeRequest("POST", { events: ["application.new"] })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it("validates required events field", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const res = await POST(
      makeRequest("POST", { url: "https://example.com/hook" })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it("validates events must not be empty", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const res = await POST(
      makeRequest("POST", { url: "https://example.com/hook", events: [] })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it("validates url must be a valid URL", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const res = await POST(
      makeRequest("POST", { url: "not-a-url", events: ["application.new"] })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it("validates events must be valid event types", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const res = await POST(
      makeRequest("POST", {
        url: "https://example.com/hook",
        events: ["invalid.event"],
      })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it("enforces 10-webhook limit", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    // Count query returns 10
    const countChain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["select", "eq"]) {
      countChain[m] = vi.fn().mockReturnValue(countChain);
    }
    countChain.eq.mockResolvedValue({ count: 10 });

    mockFrom.mockReturnValue(countChain);

    const res = await POST(
      makeRequest("POST", {
        url: "https://example.com/hook",
        events: ["application.new"],
      })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Maximum of 10 webhooks allowed per user");
  });

  it("creates webhook with url and events, returns secret", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const createdWebhook = {
      id: "wh-new",
      url: "https://example.com/hook",
      secret: "generated-hex-secret",
      events: ["application.new", "gig.update"],
      active: true,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    };

    // First call: count query (returns under limit)
    const countChain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["select", "eq"]) {
      countChain[m] = vi.fn().mockReturnValue(countChain);
    }
    countChain.eq.mockResolvedValue({ count: 3 });

    // Second call: insert query
    const insertChain = chainResult({ data: createdWebhook, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? countChain : insertChain;
    });

    const res = await POST(
      makeRequest("POST", {
        url: "https://example.com/hook",
        events: ["application.new", "gig.update"],
      })
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data).toEqual(createdWebhook);
    expect(json.data.secret).toBeDefined();
  });

  it("returns 400 when insert fails", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    // Count query: under limit
    const countChain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["select", "eq"]) {
      countChain[m] = vi.fn().mockReturnValue(countChain);
    }
    countChain.eq.mockResolvedValue({ count: 0 });

    // Insert fails
    const insertChain = chainResult({
      data: null,
      error: { message: "Insert failed" },
    });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? countChain : insertChain;
    });

    const res = await POST(
      makeRequest("POST", {
        url: "https://example.com/hook",
        events: ["application.new"],
      })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Insert failed");
  });
});
