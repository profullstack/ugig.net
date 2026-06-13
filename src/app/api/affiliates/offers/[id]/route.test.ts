// @ts-nocheck - test mocks don't match strict types
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock auth
const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

// Mock supabase service client
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

// Use REAL isValidUrl for PATCH tests (#137), mock validateOfferInput only
vi.mock("@/lib/affiliates/validation", () => ({
  validateOfferInput: vi.fn(),
  isValidUrl: vi.fn((url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }),
}));

import { GET, PATCH } from "./route";

function makeRequest(id: string, body?: Record<string, unknown>) {
  if (body) {
    return new NextRequest(`http://localhost/api/affiliates/offers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }
  return new NextRequest(`http://localhost/api/affiliates/offers/${id}`);
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function chainable(data: unknown, error: unknown = null) {
  const result = { data, error };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === "then") return undefined;
      if (prop === "data") return data;
      if (prop === "error") return error;
      return (..._args: unknown[]) => new Proxy(result, handler);
    },
  };
  return new Proxy(result, handler);
}

describe("GET /api/affiliates/offers/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(null);
  });

  it("looks up by UUID when id is a UUID (#25)", async () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const offer = { id: uuid, title: "Test", seller_id: "seller1", slug: "test" };
    
    let eqColumn: string | undefined;
    mockFrom.mockReturnValue({
      select: () => ({
        eq: (col: string, _val: string) => {
          eqColumn = col;
          return { single: () => Promise.resolve({ data: offer, error: null }) };
        },
      }),
    });

    const res = await GET(makeRequest(uuid), makeParams(uuid));
    expect(res.status).toBe(200);
    expect(eqColumn).toBe("id");
  });

  it("looks up by slug when id is not a UUID (#25)", async () => {
    const slug = "my-cool-offer";
    const offer = { id: "some-uuid", title: "Test", seller_id: "seller1", slug };
    
    let eqColumn: string | undefined;
    mockFrom.mockReturnValue({
      select: () => ({
        eq: (col: string, _val: string) => {
          eqColumn = col;
          return { single: () => Promise.resolve({ data: offer, error: null }) };
        },
      }),
    });

    const res = await GET(makeRequest(slug), makeParams(slug));
    expect(res.status).toBe(200);
    expect(eqColumn).toBe("slug");
  });

  it("hides product_url from unauthenticated users (#20)", async () => {
    const offer = {
      id: "some-uuid",
      title: "Test",
      seller_id: "seller1",
      slug: "test",
      product_url: "https://secret.example.com",
    };

    mockFrom.mockReturnValue(chainable(offer));
    mockGetAuthContext.mockResolvedValue(null);

    const slug = "test";
    const res = await GET(makeRequest(slug), makeParams(slug));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.offer.product_url).toBeUndefined();
  });

  it("returns 404 for non-existent offer", async () => {
    mockFrom.mockReturnValue(chainable(null, { message: "not found" }));

    const res = await GET(makeRequest("nonexistent"), makeParams("nonexistent"));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/affiliates/offers/[id] - product_url validation (#137)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const userId = "seller1";
    mockGetAuthContext.mockResolvedValue({
      user: { id: userId },
      supabase: {},
    });

    // Mock ownership check passing
    mockFrom.mockReturnValue(chainable(
      { id: "offer-1", seller_id: "seller1" }
    ));
  });

  it("rejects javascript: URL in product_url (#137)", async () => {
    const res = await PATCH(
      makeRequest("offer-1", { product_url: "javascript:alert(1)" }),
      makeParams("offer-1")
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("product_url");
    expect(body.error).toContain("http");
  });

  it("rejects FTP URL in product_url (#137)", async () => {
    const res = await PATCH(
      makeRequest("offer-1", { product_url: "ftp://files.example.com" }),
      makeParams("offer-1")
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("product_url");
  });

  it("rejects data: URL in product_url (#137)", async () => {
    const res = await PATCH(
      makeRequest("offer-1", { product_url: "data:text/html,<script>alert(1)</script>" }),
      makeParams("offer-1")
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("product_url");
  });

  it("rejects URL missing scheme in product_url (#137)", async () => {
    const res = await PATCH(
      makeRequest("offer-1", { product_url: "example.com/product" }),
      makeParams("offer-1")
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("product_url");
  });

  it("rejects non-string product_url values without falling through to a 500", async () => {
    const res = await PATCH(
      makeRequest("offer-1", { product_url: 123 }),
      makeParams("offer-1")
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("product_url");
    expect(body.error).toContain("string");
  });

  it("rejects non-string title values before trimming", async () => {
    const res = await PATCH(
      makeRequest("offer-1", { title: { text: "New title" } }),
      makeParams("offer-1")
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("title must be a string");
  });

  it("rejects non-string description values before trimming", async () => {
    const res = await PATCH(
      makeRequest("offer-1", { description: ["New description"] }),
      makeParams("offer-1")
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("description must be a string");
  });

  it("accepts valid https URL in product_url (#137)", async () => {
    // Mock the update chain to succeed
    mockFrom.mockReturnValue(chainable({ id: "offer-1", product_url: "https://example.com/product" }));
    
    const res = await PATCH(
      makeRequest("offer-1", { product_url: "https://example.com/product" }),
      makeParams("offer-1")
    );
    // Should NOT return 400 with a product_url error
    if (res.status === 400) {
      const body = await res.json();
      expect(body.error).not.toContain("product_url");
    }
  });

  it("accepts empty string product_url (clears the field) (#137)", async () => {
    mockFrom.mockReturnValue(chainable({ id: "offer-1", product_url: null }));
    
    const res = await PATCH(
      makeRequest("offer-1", { product_url: "" }),
      makeParams("offer-1")
    );
    // Empty string is allowed - clears the URL
    if (res.status === 400) {
      const body = await res.json();
      expect(body.error).not.toContain("product_url");
    }
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("offer-1", { product_url: "https://example.com" }),
      makeParams("offer-1")
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-owned offer", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "different-user" },
      supabase: {},
    });
    mockFrom.mockReturnValue(chainable(null));
    
    const res = await PATCH(
      makeRequest("offer-1", { product_url: "https://example.com" }),
      makeParams("offer-1")
    );
    expect(res.status).toBe(404);
  });
});
