import crypto from "crypto";

const COINPAYPORTAL_API_URL = "https://coinpayportal.com/api";

export interface CoinPayWebhookPayload {
  event: "payment.confirmed" | "payment.forwarded" | "payment.expired";
  type: string;
  payment_id: string;
  business_id: string;
  amount_crypto: number;
  amount_usd: number;
  currency: string;
  status: string;
  timestamp: string;
  tx_hash?: string;
  forwarded_tx_hash?: string;
  metadata?: Record<string, unknown>;
}

export interface CreatePaymentOptions {
  amount_usd: number;
  currency: "usdc_pol" | "usdc_sol" | "pol" | "sol" | "btc" | "eth" | "usdc_eth" | "usdt";
  description?: string;
  redirect_url?: string;
  metadata?: Record<string, unknown>;
}

export interface CreatePaymentResponse {
  success: boolean;
  payment_id: string;
  address: string;
  amount_crypto: number;
  currency: string;
  expires_at: string;
  checkout_url: string;
}

/**
 * Verify CoinPayPortal webhook signature
 * Format: X-CoinPay-Signature: t=timestamp,v1=signature
 */
export function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string
): boolean {
  try {
    // Parse signature header
    const parts = signatureHeader.split(",");
    const timestampPart = parts.find((p) => p.startsWith("t="));
    const signaturePart = parts.find((p) => p.startsWith("v1="));

    if (!timestampPart || !signaturePart) {
      return false;
    }

    const timestamp = timestampPart.replace("t=", "");
    const signature = signaturePart.replace("v1=", "");

    // Reject webhooks older than 300 seconds
    const webhookTime = parseInt(timestamp, 10);
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime - webhookTime > 300) {
      console.error("Webhook timestamp too old");
      return false;
    }

    // Compute expected signature: HMAC-SHA256(timestamp.payload, secret)
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(signedPayload)
      .digest("hex");

    // Timing-safe comparison
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

/**
 * Create a payment request with CoinPayPortal
 */
export async function createPayment(
  options: CreatePaymentOptions
): Promise<CreatePaymentResponse> {
  const apiKey = process.env.COINPAYPORTAL_API_KEY;
  const merchantId = process.env.COINPAYPORTAL_MERCHANT_ID;

  if (!apiKey || !merchantId) {
    throw new Error("CoinPayPortal credentials not configured");
  }

  const response = await fetch(`${COINPAYPORTAL_API_URL}/payments/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      business_id: merchantId,
      amount_usd: options.amount_usd,
      currency: options.currency,
      description: options.description,
      redirect_url: options.redirect_url,
      webhook_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/payments/coinpayportal/webhook`,
      metadata: options.metadata,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create payment");
  }

  return response.json();
}

/**
 * Get supported currencies with their display names
 */
export const SUPPORTED_CURRENCIES = {
  usdc_pol: { name: "USDC (Polygon)", symbol: "USDC" },
  usdc_sol: { name: "USDC (Solana)", symbol: "USDC" },
  usdc_eth: { name: "USDC (Ethereum)", symbol: "USDC" },
  usdt: { name: "USDT", symbol: "USDT" },
  pol: { name: "Polygon", symbol: "POL" },
  sol: { name: "Solana", symbol: "SOL" },
  btc: { name: "Bitcoin", symbol: "BTC" },
  eth: { name: "Ethereum", symbol: "ETH" },
} as const;

export type SupportedCurrency = keyof typeof SUPPORTED_CURRENCIES;
