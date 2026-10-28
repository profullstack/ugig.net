import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/coinpayportal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/coinpayportal")>()),
  createPayment: vi.fn(),
  preferredCoinToPaymentCurrency: vi.fn(),
}));

vi.mock("@/lib/coinpay-oauth", () => ({
  getCoinpayLink: vi.fn(),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

import { POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";
import { createPayment, preferredCoinToPaymentCurrency } from "@/lib/coinpayportal";
import { getCoinpayLink } from "@/lib/coinpay-oauth";

const SUBMITTER_SOL_WALLET = "SUBmtr1111111111111111111111111111111111111";

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
  beforeEach(() => {
    vi.clearAllMocks();
    // By default the submitter has CoinPay connected with a SOL wallet.
    // The submitter's wallets as saved when they connected CoinPay.
    (getCoinpayLink as any).mockResolvedValue({
      state: "connected",
      wallets: [{ currency: "sol", cryptocurrency: "SOL", address: SUBMITTER_SOL_WALLET, label: "My SOL" }],
    });
    (preferredCoinToPaymentCurrency as any).mockReturnValue("sol");
  });

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
    // The payout must forward to the submitter's wallet, not the platform.
    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ merchant_wallet_address: SUBMITTER_SOL_WALLET, currency: "sol" })
    );
    expect(updatePayload).toMatchObject({
      payout_status: "invoiced",
      coinpay_invoice_id: "cp-pay-bounty-1",
      pay_url: null,
      metadata: expect.objectContaining({
        expired_coinpay_invoice_id: "cp-pay-expired-1",
        expired_at: "2026-05-22T12:00:00Z",
        reviewer_note_id: "review-note-1",
        payment_address: "So11111111111111111111111111111111111111112",
        amount_crypto: 0.5,
        payment_currency: "sol",
        merchant_wallet_address: SUBMITTER_SOL_WALLET,
        checkout_url: "https://coinpayportal.com/pay/cp-pay-bounty-1",
        expires_at: "2026-05-23T12:00:00Z",
      }),
    });
  });

  it("refuses to pay when the submitter has not connected a CoinPay wallet", async () => {
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
        metadata: {},
      },
    });
    const notifyInsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "bounties") return bountyChain;
        if (table === "bounty_submissions") return submissionChain;
        if (table === "notifications") return { insert: notifyInsert };
        return chain({ data: null });
      }),
    };
    (getAuthContext as any).mockResolvedValue({ user: { id: CREATOR_ID }, supabase });
    (getCoinpayLink as any).mockResolvedValue({ state: "none", wallets: null });

    const res = await POST(req(), params);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.setup_required).toBe(true);
    expect(body.code).toBe("payout_wallet_missing");
    expect(body.api_fix).toMatchObject({ method: "PUT", path: "/api/profile/wallet-addresses" });
    expect(body.api_fix.currencies[0]).toBe("sol");
    // The winner is told what to do, so it is not left waiting on "approved".
    expect(notifyInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: SUBMITTER_ID, title: "Add a payout wallet to get paid" })
    );
    expect(createPayment).not.toHaveBeenCalled();
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
    expect(body.data.pay_url).toBeNull();
    expect(createPayment).not.toHaveBeenCalled();
  });

  it("creates a fresh in-app payment when an old invoice has no address metadata", async () => {
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
        pay_url: "https://coinpayportal.com/pay/old-hosted-checkout",
        coinpay_invoice_id: "old-cp-pay-bounty-1",
        metadata: {},
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

    (getAuthContext as any).mockResolvedValue({ user: { id: CREATOR_ID }, supabase });
    (createPayment as any).mockResolvedValue({
      success: true,
      payment_id: "cp-pay-bounty-fresh",
      address: "SoFresh1111111111111111111111111111111111111",
      amount_crypto: 0.4,
      currency: "sol",
      expires_at: "2026-05-23T13:00:00Z",
      checkout_url: "https://coinpayportal.com/pay/cp-pay-bounty-fresh",
    });

    const res = await POST(req(), params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.coinpay_invoice_id).toBe("cp-pay-bounty-fresh");
    expect(body.data.payment_address).toBe("SoFresh1111111111111111111111111111111111111");
    expect(updatePayload).toMatchObject({
      coinpay_invoice_id: "cp-pay-bounty-fresh",
      pay_url: null,
      metadata: expect.objectContaining({
        payment_address: "SoFresh1111111111111111111111111111111111111",
      }),
    });
  });

  it("does not recreate a payment for an already-paid old checkout submission", async () => {
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
        payout_status: "paid",
        pay_url: "https://coinpayportal.com/pay/old-hosted-checkout",
        coinpay_invoice_id: "old-cp-pay-bounty-paid",
        metadata: {},
      },
    });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "bounties") return bountyChain;
        if (table === "bounty_submissions") return submissionChain;
        return chain({ data: null });
      }),
    };

    (getAuthContext as any).mockResolvedValue({ user: { id: CREATOR_ID }, supabase });

    const res = await POST(req(), params);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Submission has already been paid");
    expect(createPayment).not.toHaveBeenCalled();
    expect(submissionChain.update).not.toHaveBeenCalled();
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
