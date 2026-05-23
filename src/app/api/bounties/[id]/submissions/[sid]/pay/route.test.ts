import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/coinpayportal", () => ({
  createPayment: vi.fn(),
  resolveSupportedPaymentCurrency: vi.fn(),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

import { POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";
import { createPayment, resolveSupportedPaymentCurrency } from "@/lib/coinpayportal";

const BOUNTY_ID = "11111111-1111-4111-8111-111111111111";
const SUBMISSION_ID = "22222222-2222-4222-8222-222222222222";
const CREATOR_ID = "33333333-3333-4333-8333-333333333333";
const SUBMITTER_ID = "44444444-4444-4444-8444-444444444444";

const params = { params: Promise.resolve({ id: BOUNTY_ID, sid: SUBMISSION_ID }) };

function mockSupabase() {
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });

  const bountyChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: {
        id: BOUNTY_ID,
        creator_id: CREATOR_ID,
        title: "Bounty bug fix",
        payout_usd: 25,
        payment_coin: "SOL",
      },
      error: null,
    }),
  };

  const submissionChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: {
        id: SUBMISSION_ID,
        submitter_id: SUBMITTER_ID,
        status: "approved",
        payout_status: "unpaid",
        coinpay_invoice_id: null,
        pay_url: null,
        payment_metadata: {},
      },
      error: null,
    }),
  };

  return {
    update,
    from: vi.fn((table: string) => {
      if (table === "bounties") return bountyChain;
      if (table === "bounty_submissions") {
        return {
          select: submissionChain.select,
          eq: submissionChain.eq,
          single: submissionChain.single,
          update,
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

describe("POST /api/bounties/[id]/submissions/[sid]/pay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores and returns in-app payment details without a hosted pay_url", async () => {
    const supabase = mockSupabase();
    (getAuthContext as any).mockResolvedValue({
      user: { id: CREATOR_ID },
      supabase,
    });
    (resolveSupportedPaymentCurrency as any).mockResolvedValue("sol");
    (createPayment as any).mockResolvedValue({
      payment_id: "cp-pay-1",
      address: "So11111111111111111111111111111111111111112",
      amount_crypto: 0.25,
      currency: "sol",
      checkout_url: "https://coinpay.example/hosted",
      expires_at: "2026-05-23T06:30:00Z",
    });

    const res = await POST({} as any, params);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({
      coinpay_invoice_id: "cp-pay-1",
      payment_address: "So11111111111111111111111111111111111111112",
      payment_currency: "sol",
      amount_crypto: 0.25,
      expires_at: "2026-05-23T06:30:00Z",
      pay_url: null,
    });
    expect(supabase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        payout_status: "invoiced",
        coinpay_invoice_id: "cp-pay-1",
        pay_url: null,
        payment_metadata: expect.objectContaining({
          payment_address: "So11111111111111111111111111111111111111112",
          payment_currency: "sol",
          amount_crypto: 0.25,
          checkout_url: "https://coinpay.example/hosted",
          expires_at: "2026-05-23T06:30:00Z",
        }),
      })
    );
  });
});
