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

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
const inserts: Array<{ table: string; payload: unknown }> = [];

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

function query(table: string, result: QueryResult) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.update = vi.fn((payload: Record<string, unknown>) => {
    updates.push({ table, payload });
    return builder;
  });
  builder.insert = vi.fn((payload: unknown) => {
    inserts.push({ table, payload });
    return builder;
  });
  builder.single = vi.fn(async () => result);
  builder.then = (
    resolve: (value: QueryResult) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

function mockPatchQueries(options: {
  totalAffiliates: number;
  previousStatus: string;
  nextStatus: string;
}) {
  let offerCalls = 0;
  let applicationCalls = 0;

  mockFrom.mockImplementation((table: string) => {
    if (table === "affiliate_offers") {
      if (offerCalls++ === 0) {
        return query(table, {
          data: {
            id: "offer-1",
            seller_id: "user-seller",
            total_affiliates: options.totalAffiliates,
          },
          error: null,
        });
      }
      return query(table, { data: null, error: null });
    }

    if (table === "affiliate_applications") {
      if (applicationCalls++ === 0) {
        return query(table, {
          data: {
            id: "app-1",
            status: options.previousStatus,
          },
          error: null,
        });
      }
      return query(table, {
        data: {
          id: "app-1",
          affiliate_id: "affiliate-1",
          status: options.nextStatus,
        },
        error: null,
      });
    }

    if (table === "notifications") {
      return query(table, { data: null, error: null });
    }

    return query(table, { data: null, error: null });
  });
}

describe("PATCH /api/affiliates/offers/[id]/applications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
    inserts.length = 0;
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-seller", authMethod: "session" },
    });
  });

  it("increments total_affiliates when approving a non-approved application", async () => {
    mockPatchQueries({
      totalAffiliates: 2,
      previousStatus: "pending",
      nextStatus: "approved",
    });

    const res = await PATCH(
      makePatchRequest("offer-1", {
        application_id: "app-1",
        action: "approve",
      }),
      makeParams("offer-1")
    );

    expect(res.status).toBe(200);
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "affiliate_offers",
          payload: expect.objectContaining({ total_affiliates: 3 }),
        }),
      ])
    );
  });

  it("decrements total_affiliates when rejecting an approved application", async () => {
    mockPatchQueries({
      totalAffiliates: 2,
      previousStatus: "approved",
      nextStatus: "rejected",
    });

    const res = await PATCH(
      makePatchRequest("offer-1", {
        application_id: "app-1",
        action: "reject",
      }),
      makeParams("offer-1")
    );

    expect(res.status).toBe(200);
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "affiliate_offers",
          payload: expect.objectContaining({ total_affiliates: 1 }),
        }),
      ])
    );
  });

  it("does not decrement total_affiliates below zero", async () => {
    mockPatchQueries({
      totalAffiliates: 0,
      previousStatus: "approved",
      nextStatus: "rejected",
    });

    const res = await PATCH(
      makePatchRequest("offer-1", {
        application_id: "app-1",
        action: "reject",
      }),
      makeParams("offer-1")
    );

    expect(res.status).toBe(200);
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "affiliate_offers",
          payload: expect.objectContaining({ total_affiliates: 0 }),
        }),
      ])
    );
  });

  it("leaves total_affiliates unchanged when the status is unchanged", async () => {
    mockPatchQueries({
      totalAffiliates: 2,
      previousStatus: "approved",
      nextStatus: "approved",
    });

    const res = await PATCH(
      makePatchRequest("offer-1", {
        application_id: "app-1",
        action: "approve",
      }),
      makeParams("offer-1")
    );

    expect(res.status).toBe(200);
    expect(updates.some((update) => update.table === "affiliate_offers")).toBe(false);
  });
});
