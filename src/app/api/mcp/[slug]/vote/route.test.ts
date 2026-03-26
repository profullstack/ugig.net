import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

const serviceClient = { from: vi.fn() };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => serviceClient),
}));

import { POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";

const mockGetAuthContext = vi.mocked(getAuthContext);

function makeRequest(slug: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/mcp/${slug}/vote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

describe("POST /api/mcp/[slug]/vote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const response = await POST(
      makeRequest("test-mcp", { vote_type: 1 }),
      makeParams("test-mcp")
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid vote_type", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: {} as any,
    });

    const response = await POST(
      makeRequest("test-mcp", { vote_type: 2 }),
      makeParams("test-mcp")
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("vote_type");
  });

  it("returns 404 when listing not found", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: {} as any,
    });

    serviceClient.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    });

    const response = await POST(
      makeRequest("nonexistent", { vote_type: 1 }),
      makeParams("nonexistent")
    );

    expect(response.status).toBe(404);
  });

  it("creates a new upvote", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: {} as any,
    });

    serviceClient.from.mockImplementation((table: string) => {
      if (table === "mcp_listings") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: "listing-1", status: "active", upvotes: 1, downvotes: 0, score: 1 },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "mcp_votes") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
          insert: () => Promise.resolve({ error: null }),
        };
      }
      return {};
    });

    const response = await POST(
      makeRequest("test-mcp", { vote_type: 1 }),
      makeParams("test-mcp")
    );

    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.user_vote).toBe(1);
  });
});
