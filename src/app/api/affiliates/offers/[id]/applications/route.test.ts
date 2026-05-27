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
  });

  it("returns 400 for non-object JSON bodies", async () => {
    const res = await PATCH(makePatchRequest("[]"), makeParams("offer-1"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid request body");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("approves an application and sends an approval notification", async () => {
    const updatedApplication = {
      id: "app-1",
      offer_id: "offer-1",
      affiliate_id: "affiliate-1",
      status: "approved",
      profiles: { username: "alice" },
    };
    let updatePayload: Record<string, unknown> | undefined;
    let notificationPayload: Record<string, unknown> | undefined;

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
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: "app-1", status: "pending" },
                    error: null,
                  }),
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            updatePayload = payload;
            return {
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    single: () =>
                      Promise.resolve({
                        data: updatedApplication,
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
    expect(body.application).toEqual(updatedApplication);
    expect(updatePayload).toMatchObject({ status: "approved" });
    expect(updatePayload?.approved_at).toEqual(expect.any(String));
    expect(notificationPayload).toMatchObject({
      user_id: "affiliate-1",
      type: "affiliate_approved",
      data: { offer_id: "offer-1", application_id: "app-1" },
    });
    expect(mockRpc).toHaveBeenCalledWith("increment_affiliate_offer_total_affiliates", {
      p_offer_id: "offer-1",
    });
  });

  it("decrements the affiliate count when rejecting a previously approved application", async () => {
    const updatedApplication = {
      id: "app-1",
      offer_id: "offer-1",
      affiliate_id: "affiliate-1",
      status: "rejected",
      profiles: { username: "alice" },
    };

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
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: "app-1", status: "approved" },
                    error: null,
                  }),
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: () =>
                    Promise.resolve({
                      data: updatedApplication,
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === "notifications") {
        return {
          insert: () => Promise.resolve({ data: null, error: null }),
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
    expect(body.application).toEqual(updatedApplication);
    expect(mockRpc).toHaveBeenCalledWith("decrement_affiliate_offer_total_affiliates", {
      p_offer_id: "offer-1",
    });
  });

  it("does not double count when approving an already approved application", async () => {
    const updatedApplication = {
      id: "app-1",
      offer_id: "offer-1",
      affiliate_id: "affiliate-1",
      status: "approved",
      profiles: { username: "alice" },
    };

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
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: "app-1", status: "approved" },
                    error: null,
                  }),
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: () =>
                    Promise.resolve({
                      data: updatedApplication,
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === "notifications") {
        return {
          insert: () => Promise.resolve({ data: null, error: null }),
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

    expect(res.status).toBe(200);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
