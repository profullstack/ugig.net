import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "./route";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

function makePatchRequest(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/affiliates/offers/${id}/applications`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeRawPatchRequest(id: string, body: string) {
  return new NextRequest(`http://localhost/api/affiliates/offers/${id}/applications`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
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
      return () => new Proxy(result, handler);
    },
  };
  return new Proxy(result, handler);
}

describe("PATCH /api/affiliates/offers/[id]/applications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects malformed JSON before updating the application", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
    });

    const res = await PATCH(
      makeRawPatchRequest("offer-1", "{not valid json"),
      makeParams("offer-1")
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid request body" });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("rejects non-object JSON before updating the application", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
    });

    const res = await PATCH(makeRawPatchRequest("offer-1", "null"), makeParams("offer-1"));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid request body" });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("still returns the updated application when notification insert fails", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
    });

    const notificationInsert = vi.fn().mockResolvedValue({
      error: { message: "notification table unavailable" },
    });
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockFrom.mockImplementation((table: string) => {
      if (table === "affiliate_offers") {
        return chainable({ id: "offer-1", seller_id: "seller-1" });
      }

      if (table === "affiliate_applications") {
        return chainable({
          id: "app-1",
          affiliate_id: "affiliate-1",
          offer_id: "offer-1",
          status: "approved",
          profiles: { username: "alice" },
        });
      }

      if (table === "notifications") {
        return { insert: notificationInsert };
      }

      return chainable(null);
    });

    try {
      const res = await PATCH(
        makePatchRequest("offer-1", {
          application_id: "app-1",
          action: "approve",
        }),
        makeParams("offer-1")
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.application).toMatchObject({
        id: "app-1",
        status: "approved",
      });
      expect(notificationInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "affiliate-1",
          type: "affiliate_approved",
          data: { offer_id: "offer-1", application_id: "app-1" },
        })
      );
      expect(consoleWarn).toHaveBeenCalledWith(
        "Failed to create affiliate application notification",
        { message: "notification table unavailable" }
      );
    } finally {
      consoleWarn.mockRestore();
    }
  });
});
