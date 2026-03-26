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

vi.mock("@/lib/mcp/purchase", () => ({
  executeMcpPurchase: vi.fn(),
}));

import { POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";
import { executeMcpPurchase } from "@/lib/mcp/purchase";

const mockGetAuthContext = vi.mocked(getAuthContext);
const mockExecuteMcpPurchase = vi.mocked(executeMcpPurchase);

function makeRequest(slug: string) {
  return new NextRequest(`http://localhost/api/mcp/${slug}/purchase`, {
    method: "POST",
  });
}

function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

describe("POST /api/mcp/[slug]/purchase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const response = await POST(makeRequest("test-mcp"), makeParams("test-mcp"));
    expect(response.status).toBe(401);
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

    const response = await POST(makeRequest("nonexistent"), makeParams("nonexistent"));
    expect(response.status).toBe(404);
  });

  it("returns 400 when trying to buy own listing", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
      supabase: {} as any,
    });

    serviceClient.from.mockImplementation((table: string) => {
      if (table === "mcp_listings") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: "listing-1",
                    seller_id: "seller-1",
                    price_sats: 1000,
                    status: "active",
                    title: "Test",
                  },
                  error: null,
                }),
            }),
          }),
        };
      }
      return {};
    });

    const response = await POST(makeRequest("test-mcp"), makeParams("test-mcp"));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("own");
  });

  it("returns 409 when already purchased", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "buyer-1", authMethod: "session" },
      supabase: {} as any,
    });

    serviceClient.from.mockImplementation((table: string) => {
      if (table === "mcp_listings") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: "listing-1",
                    seller_id: "seller-1",
                    price_sats: 1000,
                    status: "active",
                    title: "Test",
                  },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "mcp_purchases") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({ data: { id: "purchase-1" }, error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    const response = await POST(makeRequest("test-mcp"), makeParams("test-mcp"));
    expect(response.status).toBe(409);
  });

  it("executes purchase successfully", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "buyer-1", authMethod: "session" },
      supabase: {} as any,
    });

    serviceClient.from.mockImplementation((table: string) => {
      if (table === "mcp_listings") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: "listing-1",
                    seller_id: "seller-1",
                    price_sats: 0,
                    status: "active",
                    title: "Free MCP",
                  },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "mcp_purchases") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "subscriptions") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { username: "buyer" }, error: null }),
            }),
          }),
        };
      }
      if (table === "notifications") {
        return {
          insert: () => Promise.resolve({ error: null }),
        };
      }
      return {};
    });

    mockExecuteMcpPurchase.mockResolvedValue({
      ok: true,
      purchase_id: "purchase-1",
      fee_sats: 0,
      fee_rate: 0,
      new_balance: 10000,
    });

    const response = await POST(makeRequest("free-mcp"), makeParams("free-mcp"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.purchase_id).toBe("purchase-1");
  });
});
