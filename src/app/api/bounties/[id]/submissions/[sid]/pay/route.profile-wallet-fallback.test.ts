import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/coinpayportal", () => ({
  createPayment: vi.fn(),
  getCoinpayGlobalWalletTokens: vi.fn(),
  preferredCoinToPaymentCurrency: vi.fn(),
}));
vi.mock("@/lib/coinpay-oauth", () => ({ getConnectedCoinpayAccessToken: vi.fn() }));
vi.mock("@/lib/auth/get-user", () => ({ getAuthContext: vi.fn() }));

import { POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";
import { createPayment, getCoinpayGlobalWalletTokens, preferredCoinToPaymentCurrency } from "@/lib/coinpayportal";
import { getConnectedCoinpayAccessToken } from "@/lib/coinpay-oauth";

const BOUNTY_ID = "8489a861-0999-4107-afca-2592021ac338";
const SUBMISSION_ID = "d2317730-c56a-49e9-a6e4-dc469b7605f7";
const CREATOR_ID = "4f16c625-c37a-4654-82db-e391067cbb13";
const SUBMITTER_ID = "666cbaba-c6ea-4756-ad44-d6a5b4248f8f";
const STORED_SOL = "Stored11111111111111111111111111111111111111";

function chain(result: { data: any; error?: any }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: result.data, error: result.error ?? null }),
  };
}

describe("bounty pay profile-wallet fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getConnectedCoinpayAccessToken as any).mockResolvedValue(null);
    (getCoinpayGlobalWalletTokens as any).mockResolvedValue([]);
    (preferredCoinToPaymentCurrency as any).mockReturnValue("sol");
  });

  it("pays to the submitter's matching stored profile wallet when OAuth wallet lookup is unavailable", async () => {
    const bounty = chain({
      data: { id: BOUNTY_ID, creator_id: CREATOR_ID, title: "Test bounty", payout_usd: 1, payment_coin: "SOL" },
    });
    const submission = chain({
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
    const profile = chain({
      data: { wallet_addresses: [{ currency: "SOL", address: STORED_SOL, is_preferred: true }] },
    });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "bounties") return bounty;
        if (table === "bounty_submissions") return submission;
        if (table === "profiles") return profile;
        return chain({ data: null });
      }),
    };
    (getAuthContext as any).mockResolvedValue({ user: { id: CREATOR_ID }, supabase });
    (createPayment as any).mockResolvedValue({
      payment_id: "cp-pay-fallback",
      address: "Pay111111111111111111111111111111111111111",
      currency: "sol",
      amount_crypto: 0.01,
    });

    const res = await POST({} as any, {
      params: Promise.resolve({ id: BOUNTY_ID, sid: SUBMISSION_ID }),
    });

    expect(res.status).toBe(200);
    expect(getCoinpayGlobalWalletTokens).not.toHaveBeenCalled();
    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_usd: 1,
        currency: "sol",
        merchant_wallet_address: STORED_SOL,
      })
    );
  });
});
