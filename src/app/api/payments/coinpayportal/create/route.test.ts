import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
  requireFullAccess: vi.fn(() => null),
}));

vi.mock("@/lib/coinpayportal", () => ({
  createPayment: vi.fn(),
}));

import { POST } from "./route";
import { getAuthContext, requireFullAccess } from "@/lib/auth/get-user";
import { createPayment } from "@/lib/coinpayportal";

const USER_ID = "666cbaba-c6ea-4756-ad44-d6a5b4248f8f";
const GIG_ID = "8489a861-0999-4107-afca-2592021ac338";

function req(body?: unknown) {
  return { json: () => Promise.resolve(body) } as any;
}

describe("POST /api/payments/coinpayportal/create", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 if not authenticated", async () => {
    (getAuthContext as any).mockResolvedValue(null);

    const res = await POST(req({ type: "subscription", currency: "btc" }));

    expect(res.status).toBe(401);
  });

  it("rejects restricted public API keys", async () => {
    (getAuthContext as any).mockResolvedValue({
      user: { id: USER_ID, authMethod: "api_key", scope: "public" },
      supabase: {},
    });
    (requireFullAccess as any).mockReturnValueOnce(
      Response.json({ error: "full access required" }, { status: 403 }) as any
    );

    const res = await POST(req({ type: "subscription", currency: "btc" }));

    expect(res.status).toBe(403);
  });

  it("creates a gig payment using API-key auth context", async () => {
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: "local-payment-1" },
          error: null,
        }),
      }),
    });
    const supabase = {
      from: vi.fn(() => ({ insert })),
    };

    (getAuthContext as any).mockResolvedValue({
      user: { id: USER_ID, authMethod: "api_key", scope: "full" },
      supabase,
    });
    (createPayment as any).mockResolvedValue({
      payment_id: "coinpay-payment-1",
      checkout_url: "https://coinpayportal.com/pay/coinpay-payment-1",
      address: "bc1qexample",
      amount_crypto: "0.00002",
      currency: "btc",
      expires_at: "2026-05-20T12:00:00Z",
    });

    const res = await POST(
      req({
        type: "gig_payment",
        currency: "btc",
        amount_usd: 2,
        gig_id: GIG_ID,
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.payment_id).toBe("local-payment-1");
    expect(body.checkout_url).toBe("https://coinpayportal.com/pay/coinpay-payment-1");
    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_usd: 2,
        currency: "btc",
        description: `Gig payment for ${GIG_ID}`,
        metadata: expect.objectContaining({
          user_id: USER_ID,
          type: "gig_payment",
          gig_id: GIG_ID,
        }),
      })
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        coinpay_payment_id: "coinpay-payment-1",
        amount_usd: 2,
        currency: "btc",
        status: "pending",
        type: "gig_payment",
      })
    );
  });
});
