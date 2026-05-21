import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "./route";
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

// Mock recordConversion
const mockRecordConversion = vi.fn();
vi.mock("@/lib/affiliates/commission", () => ({
  recordConversion: (...args: unknown[]) => mockRecordConversion(...args),
}));

function makeGetRequest(id: string) {
  return new NextRequest(
    `http://localhost/api/affiliates/offers/${id}/conversions`
  );
}

function makePostRequest(id: string, body: Record<string, unknown>) {
  return new NextRequest(
    `http://localhost/api/affiliates/offers/${id}/conversions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// Helper to build chainable query mock
function chainable(data: unknown, error: unknown = null) {
  const obj: Record<string, unknown> = { data, error };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === "then") return undefined;
      if (prop === "data") return data;
      if (prop === "error") return error;
      return (..._args: unknown[]) => new Proxy({ data, error }, handler);
    },
  };
  return new Proxy(obj, handler);
}

describe("GET /api/affiliates/offers/[id]/conversions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated requests", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await GET(makeGetRequest("offer-1"), makeParams("offer-1"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 for non-owner", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-other", authMethod: "session" },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "affiliate_offers") {
        return chainable({
          id: "offer-1",
          seller_id: "user-seller",
        });
      }
      return chainable([]);
    });

    const res = await GET(makeGetRequest("offer-1"), makeParams("offer-1"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Not authorized");
  });

  it("returns conversion list for owner", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-seller", authMethod: "session" },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "affiliate_offers") {
        return chainable({
          id: "offer-1",
          seller_id: "user-seller",
        });
      }
      if (table === "affiliate_conversions") {
        return chainable([
          {
            id: "conv-1",
            affiliate_id: "aff-1",
            sale_amount_sats: 10000,
            commission_sats: 1000,
            status: "pending",
            source: "manual",
            note: "External sale via Gumroad",
            created_at: "2026-03-10T12:00:00Z",
            profiles: { username: "alice" },
          },
          {
            id: "conv-2",
            affiliate_id: "aff-2",
            sale_amount_sats: 5000,
            commission_sats: 500,
            status: "paid",
            source: null,
            note: null,
            created_at: "2026-03-09T10:00:00Z",
            profiles: { username: "bob" },
          },
        ]);
      }
      return chainable([]);
    });

    const res = await GET(makeGetRequest("offer-1"), makeParams("offer-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.conversions).toHaveLength(2);

    expect(body.conversions[0].id).toBe("conv-1");
    expect(body.conversions[0].username).toBe("alice");
    expect(body.conversions[0].source).toBe("manual");
    expect(body.conversions[0].note).toBe("External sale via Gumroad");

    expect(body.conversions[1].id).toBe("conv-2");
    expect(body.conversions[1].username).toBe("bob");
    expect(body.conversions[1].source).toBe("auto");
    expect(body.conversions[1].note).toBeNull();
  });
});

describe("POST /api/affiliates/offers/[id]/conversions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated requests", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await POST(
      makePostRequest("offer-1", {
        affiliate_id: "aff-1",
        sale_amount_sats: 5000,
      }),
      makeParams("offer-1")
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 for non-owner", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-other", authMethod: "session" },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "affiliate_offers") {
        return chainable({
          id: "offer-1",
          seller_id: "user-seller",
        });
      }
      return chainable([]);
    });

    const res = await POST(
      makePostRequest("offer-1", {
        affiliate_id: "aff-1",
        sale_amount_sats: 5000,
      }),
      makeParams("offer-1")
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Not authorized");
  });

  it("creates manual conversion with correct commission calculation", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-seller", authMethod: "session" },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "affiliate_offers") {
        return chainable({
          id: "offer-1",
          seller_id: "user-seller",
        });
      }
      if (table === "affiliate_applications") {
        return chainable({
          id: "app-1",
          status: "approved",
        });
      }
      if (table === "affiliate_conversions") {
        return chainable({ data: null, error: null });
      }
      return chainable([]);
    });

    mockRecordConversion.mockResolvedValue({
      ok: true,
      conversion_id: "conv-new",
      commission_sats: 1000,
      settles_at: "2026-03-20T12:00:00Z",
    });

    const res = await POST(
      makePostRequest("offer-1", {
        affiliate_id: "aff-1",
        sale_amount_sats: 10000,
        note: "Gumroad purchase #123",
      }),
      makeParams("offer-1")
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.conversion.id).toBe("conv-new");
    expect(body.conversion.commission_sats).toBe(1000);
    expect(body.conversion.source).toBe("manual");
    expect(body.conversion.note).toBe("Gumroad purchase #123");

    // Verify recordConversion was called with correct params
    expect(mockRecordConversion).toHaveBeenCalledWith(
      expect.anything(),
      {
        offerId: "offer-1",
        affiliateId: "aff-1",
        saleAmountSats: 10000,
      }
    );
  });

  it("rejects if affiliate is not approved", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-seller", authMethod: "session" },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "affiliate_offers") {
        return chainable({
          id: "offer-1",
          seller_id: "user-seller",
        });
      }
      if (table === "affiliate_applications") {
        return chainable(null); // not found / not approved
      }
      return chainable([]);
    });

    const res = await POST(
      makePostRequest("offer-1", {
        affiliate_id: "aff-1",
        sale_amount_sats: 5000,
      }),
      makeParams("offer-1")
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Affiliate is not approved for this offer");
  });

  it("validates required fields", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-seller", authMethod: "session" },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "affiliate_offers") {
        return chainable({
          id: "offer-1",
          seller_id: "user-seller",
        });
      }
      return chainable([]);
    });

    // Missing affiliate_id
    const res1 = await POST(
      makePostRequest("offer-1", { sale_amount_sats: 5000 }),
      makeParams("offer-1")
    );
    expect(res1.status).toBe(400);
    const body1 = await res1.json();
    expect(body1.error).toBe("affiliate_id is required");

    // Invalid sale_amount_sats
    const res2 = await POST(
      makePostRequest("offer-1", {
        affiliate_id: "aff-1",
        sale_amount_sats: -100,
      }),
      makeParams("offer-1")
    );
    expect(res2.status).toBe(400);
    const body2 = await res2.json();
    expect(body2.error).toBe("sale_amount_sats must be a positive number");
  });

  it("rejects non-string notes before recording a conversion", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-seller", authMethod: "session" },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "affiliate_offers") {
        return chainable({
          id: "offer-1",
          seller_id: "user-seller",
        });
      }
      return chainable([]);
    });

    const res = await POST(
      makePostRequest("offer-1", {
        affiliate_id: "aff-1",
        sale_amount_sats: 5000,
        note: { text: "paid elsewhere" },
      }),
      makeParams("offer-1")
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("note must be a string");
    expect(mockFrom).not.toHaveBeenCalledWith("affiliate_applications");
    expect(mockRecordConversion).not.toHaveBeenCalled();
  });
});
