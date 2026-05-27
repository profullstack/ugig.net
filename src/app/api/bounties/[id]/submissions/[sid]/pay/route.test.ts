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

const BOUNTY_ID = "8489a861-0999-4107-afca-2592021ac338";
const SUBMISSION_ID = "d2317730-c56a-49e9-a6e4-dc469b7605f7";
const CREATOR_ID = "4f16c625-c37a-4654-82db-e391067cbb13";
const SUBMITTER_ID = "666cbaba-c6ea-4756-ad44-d6a5b4248f8f";

function req() {
  return {} as any;
}

const params = {
  params: Promise.resolve({ id: BOUNTY_ID, sid: SUBMISSION_ID }),
};

function chain(result: { data: any; error?: any }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: result.data, error: result.error ?? null }),
  };
}

describe("POST /api/bounties/[id]/submissions/[sid]/pay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists in-app payment metadata for an approved bounty submission", async () => {
    const bountyChain = chain({
      data: {
        id: BOUNTY_ID,
        creator_id: CREATOR_ID,
        title: "Test bounty",
        payout_usd: 25,
        payment_coin: "SOL",
      },
    });
    const submissionChain = chain({
      data: {
        id: SUBMISSION_ID,
        submitter_id: SUBMITTER_ID,
        status: "approved",
        payout_status: "unpaid",
        pay_url: null,
        coinpay_invoice_id: null,
        metadata: {
          expired_coinpay_invoice_id: "cp-pay-expired-1",
          expired_at: "2026-05-22T12:00:00Z",
          reviewer_note_id: "review-note-1",
        },
      },
    });

    let updatePayload: Record<string, unknown> | null = null;
    submissionChain.update.mockImplementation((payload: Record<string, unknown>) => {
      updatePayload = payload;
      return submissionChain;
    });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "bounties") return bountyChain;
        if (table === "bounty_submissions") return submissionChain;
        return chain({ data: null });
      }),
    };

    (getAuthContext as any).mockResolvedValue({
      user: { id: CREATOR_ID },
      supabase,
    });
    (resolveSupportedPaymentCurrency as any).mockResolvedValue("sol");
    (createPayment as any).mockResolvedValue({
      success: true,
      payment_id: "cp-pay-bounty-1",
      address: "So11111111111111111111111111111111111111112",
      amount_crypto: 0.5,
      currency: "sol",
      expires_at: "2026-05-23T12:00:00Z",
      checkout_url: "https://coinpayportal.com/pay/cp-pay-bounty-1",
    });

    const res = await POST(req(), params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.payment_address).toBe("So11111111111111111111111111111111111111112");
    expect(updatePayload).toMatchObject({
      payout_status: "invoiced",
      coinpay_invoice_id: "cp-pay-bounty-1",
      pay_url: "https://coinpayportal.com/pay/cp-pay-bounty-1",
      metadata: expect.objectContaining({
        expired_coinpay_invoice_id: "cp-pay-expired-1",
        expired_at: "2026-05-22T12:00:00Z",
        reviewer_note_id: "review-note-1",
        payment_address: "So11111111111111111111111111111111111111112",
        amount_crypto: 0.5,
        payment_currency: "sol",
        checkout_url: "https://coinpayportal.com/pay/cp-pay-bounty-1",
        expires_at: "2026-05-23T12:00:00Z",
      }),
    });
  });

  it("returns existing payment metadata without creating a duplicate payment", async () => {
    const bountyChain = chain({
      data: {
        id: BOUNTY_ID,
        creator_id: CREATOR_ID,
        title: "Test bounty",
        payout_usd: 25,
        payment_coin: "SOL",
      },
    });
    const submissionChain = chain({
      data: {
        id: SUBMISSION_ID,
        submitter_id: SUBMITTER_ID,
        status: "approved",
        payout_status: "invoiced",
        pay_url: "https://coinpayportal.com/pay/cp-pay-bounty-1",
        coinpay_invoice_id: "cp-pay-bounty-1",
        metadata: {
          payment_address: "So11111111111111111111111111111111111111112",
          amount_crypto: 0.5,
          payment_currency: "sol",
          expires_at: "2026-05-23T12:00:00Z",
        },
      },
    });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "bounties") return bountyChain;
        if (table === "bounty_submissions") return submissionChain;
        return chain({ data: null });
      }),
    };

    (getAuthContext as any).mockResolvedValue({
      user: { id: CREATOR_ID },
      supabase,
    });

    const res = await POST(req(), params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.coinpay_invoice_id).toBe("cp-pay-bounty-1");
    expect(body.data.payment_address).toBe("So11111111111111111111111111111111111111112");
    expect(createPayment).not.toHaveBeenCalled();
  });

  it("returns the database error when loading the submission fails", async () => {
    const bountyChain = chain({
      data: {
        id: BOUNTY_ID,
        creator_id: CREATOR_ID,
        title: "Test bounty",
        payout_usd: 25,
        payment_coin: "SOL",
      },
    });
    const submissionChain = chain({
      data: null,
      error: { message: "column bounty_submissions.metadata does not exist" },
    });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "bounties") return bountyChain;
        if (table === "bounty_submissions") return submissionChain;
        return chain({ data: null });
      }),
    };

    (getAuthContext as any).mockResolvedValue({
      user: { id: CREATOR_ID },
      supabase,
    });
    vi.spyOn(console, "error").mockImplementationOnce(() => {});

    const res = await POST(req(), params);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("column bounty_submissions.metadata does not exist");
    expect(createPayment).not.toHaveBeenCalled();
  });
});
