import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

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

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  rateLimitExceeded: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => "test"),
}));

import { getAuthContext } from "@/lib/auth/get-user";
const mockGetAuthContext = vi.mocked(getAuthContext);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockAuthContext = any;

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/gigs/00000000-0000-4000-a000-000000000001/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const routeParams = { params: Promise.resolve({ id: "00000000-0000-4000-a000-000000000001" }) };

function chainResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "update", "insert", "eq", "single", "contains"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────

describe("POST /api/gigs/[id]/messages", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const req = makeRequest({ message: "Hello" });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(401);
  });

  it("returns 400 when message is empty", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "api_key" },
      supabase: supabaseClient,
    } as MockAuthContext);

    const req = makeRequest({ message: "" });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Message is required");
  });

  it("returns 400 when message is too long", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "api_key" },
      supabase: supabaseClient,
    } as MockAuthContext);

    const req = makeRequest({ message: "x".repeat(5001) });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("5000");
  });

  it("returns 404 when gig not found", async () => {
    const gigChain = chainResult({ data: null, error: null });
    mockFrom.mockReturnValue(gigChain);

    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "api_key" },
      supabase: supabaseClient,
    } as MockAuthContext);

    const req = makeRequest({ message: "Hello" });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(404);
  });

  it("returns 400 when messaging own gig", async () => {
    const gigChain = chainResult({
      data: { id: "00000000-0000-4000-a000-000000000001", poster_id: "user-1", title: "Test Gig", status: "active" },
      error: null,
    });
    mockFrom.mockReturnValue(gigChain);

    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "api_key" },
      supabase: supabaseClient,
    } as MockAuthContext);

    const req = makeRequest({ message: "Hello" });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Cannot message yourself");
  });
});

describe("POST /api/gigs/[id]/messages - success paths", () => {
  it("creates a new conversation and sends message", async () => {
    const mockChain = () => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "update", "insert", "eq", "single", "contains"]) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      return chain;
    };

    const callCount: Record<string, number> = {};
    mockFrom.mockImplementation((table: string) => {
      callCount[table] = (callCount[table] || 0) + 1;
      const chain = mockChain();

      if (table === "gigs") {
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: { id: "00000000-0000-4000-a000-000000000001", poster_id: "poster-1", title: "Test Gig", status: "active" },
          error: null,
        });
      } else if (table === "applications") {
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: { id: "app-1" },
          error: null,
        });
      } else if (table === "conversations" && callCount["conversations"] === 1) {
        // First call: no existing conversation
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
      } else if (table === "conversations" && callCount["conversations"] === 2) {
        // Second call: insert new conversation
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: { id: "conv-1" },
          error: null,
        });
      } else if (table === "conversations") {
        // Update last_message_at
        (chain.eq as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null });
      } else if (table === "messages") {
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: { id: "msg-1", created_at: "2026-03-03T00:00:00Z" },
          error: null,
        });
      } else if (table === "notifications") {
        (chain.insert as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null });
      }
      return chain;
    });

    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "api_key" },
      supabase: supabaseClient,
    } as MockAuthContext);

    const req = makeRequest({ message: "Hi, I'm interested in this gig" });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.conversation_id).toBe("conv-1");
    expect(body.message_id).toBe("msg-1");
    expect(body.created_at).toBeDefined();
  });

  it("reuses existing conversation", async () => {
    const mockChain = () => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "update", "insert", "eq", "single", "contains"]) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      return chain;
    };

    const callCount: Record<string, number> = {};
    mockFrom.mockImplementation((table: string) => {
      callCount[table] = (callCount[table] || 0) + 1;
      const chain = mockChain();

      if (table === "gigs") {
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: { id: "00000000-0000-4000-a000-000000000001", poster_id: "poster-1", title: "Test Gig", status: "active" },
          error: null,
        });
      } else if (table === "applications") {
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: { id: "app-1" },
          error: null,
        });
      } else if (table === "conversations" && callCount["conversations"] === 1) {
        // First: lookup existing conversation — found
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: { id: "existing-conv" },
          error: null,
        });
      } else if (table === "conversations") {
        // Second: update last_message_at
        (chain.eq as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null });
      } else if (table === "messages") {
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: { id: "msg-2", created_at: "2026-03-03T00:00:00Z" },
          error: null,
        });
      } else if (table === "notifications") {
        (chain.insert as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null });
      }
      return chain;
    });

    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "api_key" },
      supabase: supabaseClient,
    } as MockAuthContext);

    const req = makeRequest({ message: "Following up on my application" });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.conversation_id).toBe("existing-conv");
  });

  it("returns 403 when user has no application for gig", async () => {
    const mockChain = () => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "update", "insert", "eq", "single", "contains"]) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      return chain;
    };

    mockFrom.mockImplementation((table: string) => {
      const chain = mockChain();

      if (table === "gigs") {
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: { id: "00000000-0000-4000-a000-000000000001", poster_id: "poster-1", title: "Test Gig", status: "active" },
          error: null,
        });
      } else if (table === "applications") {
        // No application found
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
      }
      return chain;
    });

    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "api_key" },
      supabase: supabaseClient,
    } as MockAuthContext);

    const req = makeRequest({ message: "Hello" });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("must apply");
  });
});
