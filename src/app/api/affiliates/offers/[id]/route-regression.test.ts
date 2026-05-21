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

vi.mock("@/lib/affiliates/validation", () => ({
  validateOfferInput: vi.fn(),
}));

import { PATCH } from "./route";

function makeRequest(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/affiliates/offers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

describe("PATCH /api/affiliates/offers/[id] - non-string title/description (#147)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupAuthAndOwner() {
    mockGetAuthContext.mockResolvedValue({ user: { id: "seller1" } });
    mockFrom.mockReturnValue(
      chainable({ id: "offer1", seller_id: "seller1" })
    );
  }

  it("returns 400 when title is a number (#147)", async () => {
    setupAuthAndOwner();
    const res = await PATCH(makeRequest("offer1", { title: 123 }), makeParams("offer1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/title must be a string/i);
  });

  it("returns 400 when title is null (#147)", async () => {
    setupAuthAndOwner();
    const res = await PATCH(makeRequest("offer1", { title: null }), makeParams("offer1"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when title is a boolean (#147)", async () => {
    setupAuthAndOwner();
    const res = await PATCH(makeRequest("offer1", { title: true }), makeParams("offer1"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when description is a number (#147)", async () => {
    setupAuthAndOwner();
    const res = await PATCH(makeRequest("offer1", { description: 999 }), makeParams("offer1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/description must be a string/i);
  });

  it("returns 400 when description is an array (#147)", async () => {
    setupAuthAndOwner();
    const res = await PATCH(makeRequest("offer1", { description: ["bad"] }), makeParams("offer1"));
    expect(res.status).toBe(400);
  });

  it("accepts valid string title and description", async () => {
    setupAuthAndOwner();
    // Make the update return succeed
    mockFrom.mockReturnValue(
      chainable({ id: "offer1", seller_id: "seller1", title: "Updated", description: "Nice" })
    );
    const res = await PATCH(
      makeRequest("offer1", { title: "  Updated  ", description: "  Nice  " }),
      makeParams("offer1")
    );
    // Should not be 400 or 500 — the request should proceed (200 or similar)
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(500);
  });

  it("does not crash (500) when title is non-string (#147 regression)", async () => {
    setupAuthAndOwner();
    const res = await PATCH(makeRequest("offer1", { title: 42 }), makeParams("offer1"));
    // Must be 400, NOT 500
    expect(res.status).toBe(400);
  });

  it("does not crash (500) when description is non-string (#147 regression)", async () => {
    setupAuthAndOwner();
    const res = await PATCH(makeRequest("offer1", { description: { bad: true } }), makeParams("offer1"));
    expect(res.status).toBe(400);
  });
});
