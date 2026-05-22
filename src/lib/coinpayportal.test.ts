import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import {
  createInvoice,
  sendInvoice,
  getBusinessWalletCurrencies,
  getSupportedCoins,
  resolveSupportedPaymentCurrency,
  verifyWebhookSignature,
  SUPPORTED_CURRENCIES,
} from "./coinpayportal";

describe("verifyWebhookSignature", () => {
  const secret = "test-secret-key";
  const payload = JSON.stringify({
    id: "evt_pay_123_1705315800",
    type: "payment.confirmed",
    data: { payment_id: "123", status: "confirmed", amount_crypto: "0.05", amount_usd: "150.00", currency: "ETH" },
    created_at: "2024-01-15T10:30:00Z",
    business_id: "biz_xyz789",
  });

  it("verifies valid signature", () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signedPayload = `${timestamp}.${payload}`;
    const signature = crypto
      .createHmac("sha256", secret)
      .update(signedPayload)
      .digest("hex");

    const signatureHeader = `t=${timestamp},v1=${signature}`;
    expect(verifyWebhookSignature(payload, signatureHeader, secret)).toBe(true);
  });

  it("rejects invalid signature", () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signatureHeader = `t=${timestamp},v1=invalid-signature`;
    expect(verifyWebhookSignature(payload, signatureHeader, secret)).toBe(false);
  });

  it("rejects malformed signature header", () => {
    expect(verifyWebhookSignature(payload, "malformed", secret)).toBe(false);
    expect(verifyWebhookSignature(payload, "t=123", secret)).toBe(false);
    expect(verifyWebhookSignature(payload, "v1=abc", secret)).toBe(false);
  });

  it("rejects old timestamps (older than 300 seconds)", () => {
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString();
    const signedPayload = `${oldTimestamp}.${payload}`;
    const signature = crypto
      .createHmac("sha256", secret)
      .update(signedPayload)
      .digest("hex");

    const signatureHeader = `t=${oldTimestamp},v1=${signature}`;
    expect(verifyWebhookSignature(payload, signatureHeader, secret)).toBe(false);
  });

  it("rejects future timestamps (more than 300 seconds ahead)", () => {
    const futureTimestamp = (Math.floor(Date.now() / 1000) + 400).toString();
    const signedPayload = `${futureTimestamp}.${payload}`;
    const signature = crypto
      .createHmac("sha256", secret)
      .update(signedPayload)
      .digest("hex");

    const signatureHeader = `t=${futureTimestamp},v1=${signature}`;
    expect(verifyWebhookSignature(payload, signatureHeader, secret)).toBe(false);
  });

  it("accepts timestamps within 300 seconds", () => {
    const recentTimestamp = (Math.floor(Date.now() / 1000) - 100).toString();
    const signedPayload = `${recentTimestamp}.${payload}`;
    const signature = crypto
      .createHmac("sha256", secret)
      .update(signedPayload)
      .digest("hex");

    const signatureHeader = `t=${recentTimestamp},v1=${signature}`;
    expect(verifyWebhookSignature(payload, signatureHeader, secret)).toBe(true);
  });
});

describe("SUPPORTED_CURRENCIES", () => {
  it("contains all expected currencies", () => {
    expect(SUPPORTED_CURRENCIES).toHaveProperty("usdc_pol");
    expect(SUPPORTED_CURRENCIES).toHaveProperty("usdc_sol");
    expect(SUPPORTED_CURRENCIES).toHaveProperty("usdc_eth");
    expect(SUPPORTED_CURRENCIES).toHaveProperty("usdt");
    expect(SUPPORTED_CURRENCIES).toHaveProperty("pol");
    expect(SUPPORTED_CURRENCIES).toHaveProperty("sol");
    expect(SUPPORTED_CURRENCIES).toHaveProperty("btc");
    expect(SUPPORTED_CURRENCIES).toHaveProperty("eth");
  });

  it("has correct structure for each currency", () => {
    Object.values(SUPPORTED_CURRENCIES).forEach((currency) => {
      expect(currency).toHaveProperty("name");
      expect(currency).toHaveProperty("symbol");
      expect(typeof currency.name).toBe("string");
      expect(typeof currency.symbol).toBe("string");
    });
  });

  it("has expected currency details", () => {
    expect(SUPPORTED_CURRENCIES.btc.name).toBe("Bitcoin");
    expect(SUPPORTED_CURRENCIES.btc.symbol).toBe("BTC");
    expect(SUPPORTED_CURRENCIES.eth.name).toBe("Ethereum");
    expect(SUPPORTED_CURRENCIES.eth.symbol).toBe("ETH");
  });
});

describe("CoinPayPortal supported coins API", () => {
  const originalApiKey = process.env.COINPAY_API_KEY;
  const originalMerchantId = process.env.COINPAY_MERCHANT_ID;

  beforeEach(() => {
    process.env.COINPAY_API_KEY = "cp_live_" + "a".repeat(32);
    process.env.COINPAY_MERCHANT_ID = "biz_123";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          coins: [
            { symbol: "SOL", name: "Solana", is_active: true, has_wallet: true },
            { symbol: "BTC", name: "Bitcoin", is_active: true, has_wallet: true },
          ],
          businesses: [
            {
              id: "biz_123",
              name: "uGig",
              walletAddresses: {
                SOL: "SolAddress1234567890",
                BTC: "bc1qaddress1234567890",
              },
            },
          ],
        }),
      })
    );
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.COINPAY_API_KEY;
    } else {
      process.env.COINPAY_API_KEY = originalApiKey;
    }

    if (originalMerchantId === undefined) {
      delete process.env.COINPAY_MERCHANT_ID;
    } else {
      process.env.COINPAY_MERCHANT_ID = originalMerchantId;
    }

    vi.unstubAllGlobals();
  });

  it("fetches active business wallet coins from CoinPayPortal", async () => {
    await getSupportedCoins();

    expect(fetch).toHaveBeenCalledWith(
      "https://coinpayportal.com/api/supported-coins?business_id=biz_123&active_only=true",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${process.env.COINPAY_API_KEY}`,
        }),
      })
    );
  });

  it("fetches configured business wallet addresses from CoinPayPortal", async () => {
    const wallets = await getBusinessWalletCurrencies();

    expect(fetch).toHaveBeenCalledWith(
      "https://coinpayportal.com/api/businesses",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${process.env.COINPAY_API_KEY}`,
        }),
      })
    );
    expect(wallets).toEqual([
      expect.objectContaining({ currency: "SOL", address: "SolAddress1234567890" }),
      expect.objectContaining({ currency: "BTC", address: "bc1qaddress1234567890" }),
    ]);
  });

  it("resolves a preferred gig coin from active CoinPay wallets", async () => {
    await expect(resolveSupportedPaymentCurrency("SOL")).resolves.toBe("sol");
  });

  it("rejects preferred gig coins not configured in CoinPay", async () => {
    await expect(resolveSupportedPaymentCurrency("ETH")).rejects.toThrow(
      "CoinPayPortal does not have an active ETH wallet configured"
    );
  });
});

describe("CoinPayPortal invoice API", () => {
  const originalApiKey = process.env.COINPAY_API_KEY;
  const originalMerchantId = process.env.COINPAY_MERCHANT_ID;
  const originalUgigBusinessId = process.env.COINPAY_UGIG_BUSINESS_ID;
  const originalBusinessId = process.env.COINPAY_BUSINESS_ID;
  const originalGenericBusinessId = process.env.BUSINESS_ID;

  beforeEach(() => {
    process.env.COINPAY_API_KEY = "cp_live_" + "a".repeat(32);
    process.env.COINPAY_MERCHANT_ID = "biz_123";
    delete process.env.COINPAY_UGIG_BUSINESS_ID;
    delete process.env.COINPAY_BUSINESS_ID;
    delete process.env.BUSINESS_ID;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          invoice: {
            id: "inv_123",
            status: "draft",
            amount: 25,
            currency: "USD",
          },
        }),
      })
    );
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.COINPAY_API_KEY;
    } else {
      process.env.COINPAY_API_KEY = originalApiKey;
    }

    if (originalMerchantId === undefined) {
      delete process.env.COINPAY_MERCHANT_ID;
    } else {
      process.env.COINPAY_MERCHANT_ID = originalMerchantId;
    }

    if (originalUgigBusinessId === undefined) {
      delete process.env.COINPAY_UGIG_BUSINESS_ID;
    } else {
      process.env.COINPAY_UGIG_BUSINESS_ID = originalUgigBusinessId;
    }

    if (originalBusinessId === undefined) {
      delete process.env.COINPAY_BUSINESS_ID;
    } else {
      process.env.COINPAY_BUSINESS_ID = originalBusinessId;
    }

    if (originalGenericBusinessId === undefined) {
      delete process.env.BUSINESS_ID;
    } else {
      process.env.BUSINESS_ID = originalGenericBusinessId;
    }

    vi.unstubAllGlobals();
  });

  it("creates invoices with Bearer auth for CoinPayPortal compatibility", async () => {
    await createInvoice({ amount: 25, currency: "USD", notes: "test invoice" });

    expect(fetch).toHaveBeenCalledWith(
      "https://coinpayportal.com/api/invoices",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.COINPAY_API_KEY}`,
        }),
      })
    );
  });

  it("uses UGig-specific business id env aliases before the generic merchant id", async () => {
    process.env.COINPAY_UGIG_BUSINESS_ID = "biz_ugig";
    process.env.COINPAY_BUSINESS_ID = "biz_coinpay";
    process.env.BUSINESS_ID = "biz_generic";
    process.env.COINPAY_MERCHANT_ID = "biz_merchant";

    await createInvoice({ amount: 25, currency: "USD", notes: "test invoice" });

    expect(fetch).toHaveBeenCalledWith(
      "https://coinpayportal.com/api/invoices",
      expect.objectContaining({
        body: expect.stringContaining('"business_id":"biz_ugig"'),
      })
    );
  });

  it("sends invoices with Bearer auth for CoinPayPortal compatibility", async () => {
    await sendInvoice("inv_123");

    expect(fetch).toHaveBeenCalledWith(
      "https://coinpayportal.com/api/invoices/inv_123/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.COINPAY_API_KEY}`,
        }),
      })
    );
  });
});
