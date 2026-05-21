import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "./route";

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

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/affiliates/offers/[id]/applications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
    });
  });

  it("clears approved_at when rejecting an affiliate application", async () => {
    let applicationUpdate: Record<string, unknown> | undefined;

    mockFrom.mockImplementation((table: string) => {
      if (table === "affiliate_offers") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: "offer-1", seller_id: "seller-1" },
                  error: null,
                }),
            }),
          }),
        };
      }

      if (table === "affiliate_applications") {
        return {
          update: (data: Record<string, unknown>) => {
            applicationUpdate = data;
            return {
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    single: () =>
                      Promise.resolve({
                        data: {
                          id: "app-1",
                          affiliate_id: "affiliate-1",
                          offer_id: "offer-1",
                          status: data.status,
                          approved_at: data.approved_at,
                        },
                        error: null,
                      }),
                  }),
                }),
              }),
            };
          },
        };
      }

      if (table === "notifications") {
        return {
          insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        };
      }

      return {};
    });

    const res = await PATCH(
      makePatchRequest("offer-1", {
        application_id: "app-1",
        action: "reject",
      }),
      makeParams("offer-1")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(applicationUpdate).toMatchObject({
      status: "rejected",
      approved_at: null,
    });
    expect(body.application.approved_at).toBeNull();
  });
});
