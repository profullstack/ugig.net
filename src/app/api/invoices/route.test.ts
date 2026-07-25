import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

import { GET } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";

const WORKER_ID = "4f16c625-c37a-4654-82db-e391067cbb13";
const POSTER_ID = "a1b2c3d4-1111-4222-8333-444455556666";

function request(url = "http://localhost/api/invoices") {
  return { url } as any;
}

const paidInvoice = {
  id: "inv-1",
  worker_id: WORKER_ID,
  poster_id: POSTER_ID,
  status: "paid",
  metadata: {
    payment_currency: "usdc_pol",
    tx_hash: "0xpayment",
    merchant_tx_hash: "0xpayout",
  },
};

/** Minimal PostgREST-style chain that resolves with the given rows. */
function mockAuth(userId: string, rows: unknown[]) {
  const query: any = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    eq: vi.fn(() => query),
    or: vi.fn(() => query),
    then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
  };
  (getAuthContext as any).mockResolvedValue({
    user: { id: userId },
    supabase: { from: vi.fn(() => query) },
  });
}

describe("GET /api/invoices", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 without a session", async () => {
    (getAuthContext as any).mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  // The whole point of deriving the receipt server-side: whoever asks, worker
  // or poster, gets the same transaction ids and explorer links.
  it.each([
    ["worker", WORKER_ID],
    ["poster", POSTER_ID],
  ])("gives the %s the transaction ids and explorer links", async (_role, userId) => {
    mockAuth(userId, [paidInvoice]);

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data[0].transactions).toEqual([
      expect.objectContaining({
        role: "payment",
        tx_hash: "0xpayment",
        explorer_url: "https://polygonscan.com/tx/0xpayment",
        explorer_name: "PolygonScan",
      }),
      expect.objectContaining({
        role: "payout",
        tx_hash: "0xpayout",
        explorer_url: "https://polygonscan.com/tx/0xpayout",
      }),
    ]);
  });

  it("returns an empty transaction list for invoices with no on-chain payment", async () => {
    mockAuth(POSTER_ID, [{ ...paidInvoice, status: "sent", metadata: {} }]);

    const body = await (await GET(request())).json();
    expect(body.data[0].transactions).toEqual([]);
  });

  it("surfaces a query error", async () => {
    const query: any = {
      select: vi.fn(() => query),
      order: vi.fn(() => query),
      or: vi.fn(() => query),
      then: (resolve: (v: unknown) => unknown) =>
        resolve({ data: null, error: { message: "boom" } }),
    };
    (getAuthContext as any).mockResolvedValue({
      user: { id: POSTER_ID },
      supabase: { from: vi.fn(() => query) },
    });

    const res = await GET(request());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("boom");
  });
});
