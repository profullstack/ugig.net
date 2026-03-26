import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

const mockFrom = vi.fn();

const supabaseClient = {
  from: mockFrom,
  auth: { getUser: vi.fn() },
};

const serviceClient = {
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseClient)),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => serviceClient),
}));

import { GET, PATCH, DELETE } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";

const mockGetAuthContext = vi.mocked(getAuthContext);

// ── Helpers ────────────────────────────────────────────────────────

function makeGetRequest(slug: string) {
  return new NextRequest(`http://localhost/api/mcp/${slug}`, { method: "GET" });
}

function makePatchRequest(slug: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/mcp/${slug}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(slug: string) {
  return new NextRequest(`http://localhost/api/mcp/${slug}`, { method: "DELETE" });
}

function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("GET /api/mcp/[slug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when listing not found", async () => {
    supabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } });
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: { message: "Not found" } }),
        }),
      }),
    });

    const response = await GET(makeGetRequest("nonexistent"), makeParams("nonexistent"));
    expect(response.status).toBe(404);
  });

  it("returns listing details", async () => {
    const listing = {
      id: "listing-1",
      slug: "test-mcp",
      title: "Test MCP",
      seller_id: "seller-1",
      status: "active",
      mcp_server_url: "https://example.com/mcp",
      transport_type: "sse",
      supported_tools: ["read_file"],
      upvotes: 5,
      downvotes: 1,
      score: 4,
      seller: { id: "seller-1", username: "seller", full_name: "Seller" },
    };

    supabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } });

    mockFrom.mockImplementation((table: string) => {
      if (table === "mcp_listings") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: listing, error: null }),
            }),
          }),
        };
      }
      if (table === "mcp_reviews") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      };
    });

    serviceClient.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    });

    const response = await GET(makeGetRequest("test-mcp"), makeParams("test-mcp"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.listing.title).toBe("Test MCP");
    expect(json.listing.mcp_server_url).toBe("https://example.com/mcp");
  });
});

describe("PATCH /api/mcp/[slug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const response = await PATCH(
      makePatchRequest("test-mcp", { title: "Updated" }),
      makeParams("test-mcp")
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when not the owner", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "other-user", authMethod: "session" },
      supabase: supabaseClient as any,
    });

    serviceClient.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({ data: { id: "listing-1", seller_id: "seller-1" }, error: null }),
        }),
      }),
    });

    const response = await PATCH(
      makePatchRequest("test-mcp", { title: "Updated" }),
      makeParams("test-mcp")
    );

    expect(response.status).toBe(403);
  });
});

describe("DELETE /api/mcp/[slug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const response = await DELETE(makeDeleteRequest("test-mcp"), makeParams("test-mcp"));
    expect(response.status).toBe(401);
  });
});
