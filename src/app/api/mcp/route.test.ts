import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

const mockFrom = vi.fn();

const supabaseClient = {
  from: mockFrom,
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
};

const serviceClient = { from: vi.fn() };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseClient)),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => serviceClient),
}));

import { GET, POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";

const mockGetAuthContext = vi.mocked(getAuthContext);

// ── Helpers ────────────────────────────────────────────────────────

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/mcp");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url, { method: "GET" });
}

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Tests ──────────────────────────────────────────────────────────

describe("GET /api/mcp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns listings with default sort", async () => {
    const listings = [
      { id: "1", title: "MCP Server A", slug: "mcp-server-a", status: "active" },
    ];

    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          or: () => ({
            overlaps: () => ({
              order: () => ({
                range: () =>
                  Promise.resolve({ data: listings, count: 1, error: null }),
              }),
            }),
            order: () => ({
              range: () =>
                Promise.resolve({ data: listings, count: 1, error: null }),
            }),
          }),
          order: () => ({
            range: () =>
              Promise.resolve({ data: listings, count: 1, error: null }),
          }),
        }),
      }),
    });

    const response = await GET(makeGetRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.listings).toHaveLength(1);
    expect(json.total).toBe(1);
    expect(json.page).toBe(1);
  });

  it("returns empty listings when none exist", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => ({
            range: () =>
              Promise.resolve({ data: [], count: 0, error: null }),
          }),
        }),
      }),
    });

    const response = await GET(makeGetRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.listings).toHaveLength(0);
    expect(json.total).toBe(0);
  });
});

describe("POST /api/mcp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const response = await POST(
      makePostRequest({
        title: "Test MCP Server",
        description: "A test MCP server for doing automated things",
        price_sats: 1000,
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid input", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: supabaseClient as any,
    });

    const response = await POST(
      makePostRequest({
        title: "ab", // too short
        description: "short",
        price_sats: -1,
      })
    );

    expect(response.status).toBe(400);
  });

  it("creates listing for authenticated user", async () => {
    const createdListing = {
      id: "listing-1",
      slug: "test-mcp-server",
      title: "Test MCP Server",
      seller_id: "user-1",
    };

    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: supabaseClient as any,
    });

    serviceClient.from.mockImplementation((table: string) => {
      if (table === "mcp_listings") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: createdListing, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    const response = await POST(
      makePostRequest({
        title: "Test MCP Server",
        description: "A test MCP server for doing automated things well",
        price_sats: 1000,
        category: "coding",
        tags: ["test"],
        mcp_server_url: "https://example.com/mcp",
        transport_type: "sse",
        supported_tools: ["read_file", "search"],
      })
    );

    const json = await response.json();
    expect(response.status).toBe(201);
    expect(json.listing.slug).toBe("test-mcp-server");
  });

  it("handles slug collision", async () => {
    const createdListing = {
      id: "listing-2",
      slug: "test-mcp-server-abc123",
      title: "Test MCP Server",
      seller_id: "user-1",
    };

    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: supabaseClient as any,
    });

    serviceClient.from.mockImplementation((table: string) => {
      if (table === "mcp_listings") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: { id: "existing-1" }, error: null }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: createdListing, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    const response = await POST(
      makePostRequest({
        title: "Test MCP Server",
        description: "A test MCP server for doing automated things well",
        price_sats: 0,
      })
    );

    expect(response.status).toBe(201);
  });
});
