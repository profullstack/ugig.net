import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const mockCreate = vi.fn();
vi.mock("@/lib/coinpay-client", async (orig) => ({
  ...(await orig<typeof import("@/lib/coinpay-client")>()),
  createCoinpayPayment: (...a: unknown[]) => mockCreate(...a),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => null }));

import { POST } from "./route";

const call = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/funding/create-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

describe("POST /api/funding/create-invoice", () => {
  it("refuses card checkout (crypto only)", async () => {
    const res = await call({ amount_usd: 50, currency: "card" });
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("accepts a crypto currency", async () => {
    mockCreate.mockResolvedValue({ payment_id: "cp-1", address: "addr", amount_crypto: 1, currency: "usdc_pol" });
    const res = await call({ amount_usd: 50, currency: "usdc_pol" });
    expect(res.status).toBe(200);
  });
});
