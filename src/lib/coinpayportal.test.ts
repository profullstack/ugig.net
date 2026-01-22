import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";
import { verifyWebhookSignature, SUPPORTED_CURRENCIES } from "./coinpayportal";

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
