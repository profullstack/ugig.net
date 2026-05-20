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

import { GET, PATCH } from "./route";

function makeRequest(id: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`http://localhost/api/affiliates/offers/${id}`, init);
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

describe("PATCH /api/affiliates/offers/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue({ user: { id: "seller1" } });
  });

  it("rejects clearing the last active destination (#88)", async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: {
              id: "offer1",
              seller_id: "seller1",
              product_url: "https://example.com/product",
              listing_id: null,
              status: "active",
            },
            error: null,
          }),
        }),
      }),
    });

    const res = await PATCH(
      makeRequest("offer1", {
        method: "PATCH",
        body: JSON.stringify({ product_url: "   " }),
      }),
      makeParams("offer1")
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("product_url");
    expect(body.error).toContain("listing_id");
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it("allows clearing product_url when a listing_id still provides a destination (#88)", async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: () => ({
        select: () => ({
          single: () => Promise.resolve({
            data: {
              id: "offer1",
              seller_id: "seller1",
              product_url: null,
              listing_id: "listing-1",
              status: "active",
            },
            error: null,
          }),
        }),
      }),
    });

    mockFrom
      .mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: {
                id: "offer1",
                seller_id: "seller1",
                product_url: "https://example.com/product",
                listing_id: "listing-1",
                status: "active",
              },
              error: null,
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        update: updateMock,
      });

    const res = await PATCH(
      makeRequest("offer1", {
        method: "PATCH",
        body: JSON.stringify({ product_url: "   " }),
      }),
      makeParams("offer1")
    );

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ product_url: null }));
  });
});
