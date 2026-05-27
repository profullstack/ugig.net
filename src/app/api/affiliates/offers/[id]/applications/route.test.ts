import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "./route";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makePatchRequest(body: BodyInit, contentType = "application/json") {
  return new NextRequest(
    "http://localhost/api/affiliates/offers/offer-1/applications",
    {
      method: "PATCH",
      headers: { "content-type": contentType },
      body,
    }
  );
}

function mockOwnedOffer() {
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

function mockUpdatedApplication(status: "approved" | "rejected") {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: {
                id: "app-1",
                offer_id: "offer-1",
                affiliate_id: "affiliate-1",
                status,
                profiles: { username: "alice" },
              },
              error: null,
            }),
        }),
      }),
    }),
  };
}

describe("PATCH /api/affiliates/offers/[id]/applications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockGetAuthContext.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
    });
  });

  it("returns 400 for malformed JSON before touching application updates", async () => {
    const res = await PATCH(makePatchRequest("{not valid json"), makeParams("offer-1"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid request body");
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 400 for non-object JSON bodies", async () => {
    const res = await PATCH(makePatchRequest("[]"), makeParams("offer-1"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid request body");
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("approves an application through the atomic status RPC and sends a notification", async () => {
    let notificationPayload: Record<string, unknown> | undefined;

    mockFrom.mockImplementation((table: string) => {
      if (table === "affiliate_offers") return mockOwnedOffer();
      if (table === "affiliate_applications") return mockUpdatedApplication("approved");
      if (table === "notifications") {
        return {
          insert: (payload: Record<string, unknown>) => {
            notificationPayload = payload;
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await PATCH(
      makePatchRequest(
        JSON.stringify({ application_id: "app-1", action: "approve" })
      ),
      makeParams("offer-1")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.application).toMatchObject({ id: "app-1", status: "approved" });
    expect(mockRpc).toHaveBeenCalledWith("update_affiliate_application_status", {
      p_application_id: "app-1",
      p_offer_id: "offer-1",
      p_status: "approved",
    });
    expect(notificationPayload).toMatchObject({
      user_id: "affiliate-1",
      type: "affiliate_approved",
      data: { offer_id: "offer-1", application_id: "app-1" },
    });
  });

  it("rejects an application through the atomic status RPC and sends a notification", async () => {
    let notificationPayload: Record<string, unknown> | undefined;

    mockFrom.mockImplementation((table: string) => {
      if (table === "affiliate_offers") return mockOwnedOffer();
      if (table === "affiliate_applications") return mockUpdatedApplication("rejected");
      if (table === "notifications") {
        return {
          insert: (payload: Record<string, unknown>) => {
            notificationPayload = payload;
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await PATCH(
      makePatchRequest(
        JSON.stringify({ application_id: "app-1", action: "reject" })
      ),
      makeParams("offer-1")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.application).toMatchObject({ id: "app-1", status: "rejected" });
    expect(mockRpc).toHaveBeenCalledWith("update_affiliate_application_status", {
      p_application_id: "app-1",
      p_offer_id: "offer-1",
      p_status: "rejected",
    });
    expect(notificationPayload).toMatchObject({
      user_id: "affiliate-1",
      type: "affiliate_rejected",
      title: "Affiliate application declined",
      body: "Your affiliate application was not approved.",
      data: { offer_id: "offer-1", application_id: "app-1" },
    });
  });

  it("returns an error and does not notify when the atomic status RPC fails", async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Application not found" },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "affiliate_offers") return mockOwnedOffer();
      if (table === "notifications") {
        return {
          insert: vi.fn(),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await PATCH(
      makePatchRequest(
        JSON.stringify({ application_id: "app-1", action: "approve" })
      ),
      makeParams("offer-1")
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Application not found");
    expect(mockFrom).not.toHaveBeenCalledWith("notifications");
  });
});
