import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createFakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

let db: FakeSupabase;
const userClient = { from: vi.fn(() => { throw new Error("status route must not write with the user client"); }) };
const mockGetPaymentStatus = vi.fn();

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db }));
vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(async () => ({ user: { id: "user-1" }, supabase: userClient })),
}));
vi.mock("@/lib/coinpayportal", () => ({
  getPaymentStatus: (...args: unknown[]) => mockGetPaymentStatus(...args),
}));

import { GET } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";

function poll(id = "local-1") {
  return GET(new NextRequest(`http://localhost/api/payments/coinpayportal/status?payment_id=${id}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  db = createFakeSupabase({
    payments: [
      {
        id: "local-1",
        user_id: "user-1",
        coinpay_payment_id: "cp-1",
        amount_usd: 90,
        status: "pending",
        type: "subscription",
        metadata: { plan: "annual" },
      },
      { id: "other-user", user_id: "user-2", coinpay_payment_id: "cp-2", status: "pending", type: "tip", metadata: {} },
    ],
    subscriptions: [],
    notifications: [],
  });
});

describe("GET /api/payments/coinpayportal/status", () => {
  it("401 without auth", async () => {
    vi.mocked(getAuthContext).mockResolvedValueOnce(null);
    expect((await poll()).status).toBe(401);
  });

  it("404 for someone else's payment", async () => {
    expect((await poll("other-user")).status).toBe(404);
  });

  it("a confirmed poll writes with the service client and activates the plan", async () => {
    mockGetPaymentStatus.mockResolvedValue({ success: true, payment: { id: "cp-1", status: "confirmed", tx_hash: "0x1" } });
    const res = await poll();
    expect(await res.json()).toMatchObject({ status: "confirmed", provider_status: "confirmed" });
    expect(db.tables.payments[0].status).toBe("confirmed");
    expect(db.tables.subscriptions[0]).toMatchObject({ user_id: "user-1", plan: "pro" });
    expect(userClient.from).not.toHaveBeenCalled();
  });

  it("maps provider statuses to the enum (forwarding_failed -> confirmed, detected -> pending)", async () => {
    mockGetPaymentStatus.mockResolvedValueOnce({ success: true, payment: { id: "cp-1", status: "detected" } });
    expect((await (await poll()).json()).status).toBe("pending");
    expect(db.tables.payments[0].status).toBe("pending");

    mockGetPaymentStatus.mockResolvedValueOnce({ success: true, payment: { id: "cp-1", status: "forwarding_failed" } });
    expect((await (await poll()).json()).status).toBe("confirmed");
    expect(db.tables.payments[0].status).toBe("confirmed");
  });

  it("an expired provider status expires a pending row", async () => {
    mockGetPaymentStatus.mockResolvedValue({ success: true, payment: { id: "cp-1", status: "expired" } });
    await poll();
    expect(db.tables.payments[0].status).toBe("expired");
  });

  it("a poll and a webhook seeing the same payment activate it once", async () => {
    mockGetPaymentStatus.mockResolvedValue({ success: true, payment: { id: "cp-1", status: "confirmed" } });
    await poll();
    await poll();
    expect(db.tables.notifications).toHaveLength(1);
  });

  it("falls back to the local row when CoinPay is unreachable", async () => {
    mockGetPaymentStatus.mockRejectedValue(new Error("down"));
    expect(await (await poll()).json()).toMatchObject({ status: "pending" });
  });
});
