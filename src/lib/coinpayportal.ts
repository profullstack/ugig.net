import crypto from "crypto";

const COINPAY_API_URL = "https://coinpayportal.com/api";

export interface CoinPayWebhookPayload {
  id: string;
  type: "payment.confirmed" | "payment.forwarded" | "payment.expired" | "escrow.funded" | "escrow.released" | "escrow.refunded" | "escrow.disputed";
  data: {
    payment_id: string;
    status: string;
    amount_crypto: string;
    amount_usd: string;
    currency: string;
    payment_address?: string;
    tx_hash?: string;
    merchant_tx_hash?: string;
    metadata?: Record<string, unknown>;
  };
  created_at: string;
  business_id: string;
}

export interface CreatePaymentOptions {
  amount_usd: number;
  currency: "usdc_pol" | "usdc_sol" | "pol" | "sol" | "btc" | "eth" | "usdc_eth" | "usdt";
  description?: string;
  redirect_url?: string;
  metadata?: Record<string, unknown>;
  business_id?: string;
}

export interface CreatePaymentResponse {
  success: boolean;
  payment_id: string;
  address: string;
  amount_crypto: number;
  currency: string;
  expires_at: string;
  checkout_url?: string;
  payment: {
    id: string;
    payment_address?: string;
    amount_crypto?: number;
    crypto_amount?: number;
    currency?: string;
    status?: string;
    expires_at?: string;
    [key: string]: unknown;
  };
}

export interface SupportedCoin {
  symbol?: string;
  code?: string;
  currency?: string;
  id?: string;
  name?: string;
  chain?: string;
  network?: string;
  blockchain?: string;
  is_active?: boolean;
  has_wallet?: boolean;
  [key: string]: unknown;
}

export interface SupportedCoinsResponse {
  success: boolean;
  coins: SupportedCoin[];
  business_id?: string;
  total?: number;
}

export interface BusinessWalletCurrency {
  currency: string;
  address: string;
  is_active?: boolean;
  [key: string]: unknown;
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

    // Reject webhooks older than 300 seconds (check both past and future)
    const webhookTime = parseInt(timestamp, 10);
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - webhookTime) > 300) {
      console.error("Webhook timestamp out of range");
      return false;
    }

    // Compute expected signature: HMAC-SHA256(timestamp.payload, secret)
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(signedPayload)
      .digest("hex");

    // Timing-safe comparison (use hex encoding for proper byte comparison)
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
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
  const apiKey = process.env.COINPAY_API_KEY;
  const merchantId = options.business_id || process.env.COINPAY_MERCHANT_ID;

  if (!apiKey || !merchantId) {
    throw new Error("CoinPayPortal credentials not configured");
  }

  const response = await fetch(`${COINPAY_API_URL}/payments/create`, {
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
      webhook_url: `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net"}/api/payments/coinpayportal/webhook`,
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

const SUPPORTED_CURRENCY_KEYS = Object.keys(SUPPORTED_CURRENCIES) as SupportedCurrency[];

function isSupportedCurrency(value: string): value is SupportedCurrency {
  return SUPPORTED_CURRENCY_KEYS.includes(value as SupportedCurrency);
}

function normalizeCurrencyKey(value?: string | null): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeCoinSymbol(value?: string | null): string {
  return (value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

export function coinToPaymentCurrency(coin: SupportedCoin): SupportedCurrency | null {
  const directCurrency =
    normalizeCurrencyKey(coin.currency) ||
    normalizeCurrencyKey(coin.id) ||
    normalizeCurrencyKey(coin.code);
  if (isSupportedCurrency(directCurrency)) return directCurrency;

  const symbol =
    normalizeCoinSymbol(coin.symbol) ||
    normalizeCoinSymbol(coin.code) ||
    normalizeCoinSymbol(coin.currency) ||
    normalizeCoinSymbol(coin.id);
  const chain =
    normalizeCoinSymbol(coin.chain) ||
    normalizeCoinSymbol(coin.network) ||
    normalizeCoinSymbol(coin.blockchain);

  if (symbol === "BTC") return "btc";
  if (symbol === "ETH") return "eth";
  if (symbol === "POL" || symbol === "MATIC") return "pol";
  if (symbol === "SOL") return "sol";
  if (symbol === "USDT") return "usdt";
  if (symbol === "USDC") {
    if (chain === "POL" || chain === "POLYGON" || chain === "MATIC") return "usdc_pol";
    if (chain === "ETH" || chain === "ETHEREUM") return "usdc_eth";
    return "usdc_sol";
  }

  return null;
}

function coinMatchesPreference(
  coin: SupportedCoin | BusinessWalletCurrency,
  preferredCoin: string
): boolean {
  const preferred = normalizeCoinSymbol(preferredCoin);
  const record = coin as Record<string, unknown>;
  const candidates = [
    record.symbol,
    record.code,
    record.currency,
    record.id,
    record.name,
  ].map((value) => (typeof value === "string" ? normalizeCoinSymbol(value) : ""));

  return candidates.includes(preferred);
}

function getStringValue(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function extractWalletCurrenciesFromBusiness(
  business: Record<string, unknown>
): BusinessWalletCurrency[] {
  const candidates = [
    business.deposit_addresses,
    business.depositAddresses,
    business.wallet_addresses,
    business.walletAddresses,
    business.addresses,
    business.wallets,
    business.coins,
  ];
  const wallets = new Map<string, BusinessWalletCurrency>();

  const addWallet = (currency: string | null, address: string | null, source?: Record<string, unknown>) => {
    if (!currency || !address) return;
    const key = normalizeCoinSymbol(currency);
    if (!key || wallets.has(key)) return;
    wallets.set(key, {
      ...(source || {}),
      currency: key,
      address,
      is_active:
        source?.is_active === false ||
        source?.active === false ||
        source?.enabled === false
          ? false
          : true,
    });
  };

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;

    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        addWallet(
          getStringValue(record, ["currency", "symbol", "coin", "chain", "network", "id"]),
          getStringValue(record, ["address", "wallet_address", "walletAddress", "deposit_address", "depositAddress"]),
          record
        );
      }
      continue;
    }

    for (const [currency, value] of Object.entries(candidate as Record<string, unknown>)) {
      if (typeof value === "string") {
        addWallet(currency, value);
      } else if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        addWallet(
          getStringValue(record, ["currency", "symbol", "coin", "chain", "network", "id"]) || currency,
          getStringValue(record, ["address", "wallet_address", "walletAddress", "deposit_address", "depositAddress"]),
          record
        );
      }
    }
  }

  return [...wallets.values()].filter((wallet) => wallet.is_active !== false);
}

export async function getBusinessWalletCurrencies(options: {
  business_id?: string;
} = {}): Promise<BusinessWalletCurrency[]> {
  const apiKey = process.env.COINPAY_API_KEY;
  const businessId = options.business_id || process.env.COINPAY_MERCHANT_ID;

  if (!apiKey || !businessId) {
    throw new Error("CoinPayPortal credentials not configured");
  }

  const response = await fetch(`${COINPAY_API_URL}/businesses`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `Business wallets fetch failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    businesses?: Array<Record<string, unknown>>;
    business?: Record<string, unknown>;
  };
  const businesses = data.businesses || (data.business ? [data.business] : []);
  const business = businesses.find((entry) => entry.id === businessId);

  if (!business) {
    throw new Error(`CoinPayPortal business not found: ${businessId}`);
  }

  const wallets = extractWalletCurrenciesFromBusiness(business);
  if (wallets.length === 0) {
    throw new Error(`CoinPayPortal business ${businessId} has no wallet addresses configured`);
  }

  return wallets;
}

/**
 * Fetch the business-specific active wallet coins from CoinPayPortal. This keeps
 * invoice payment options aligned with the merchant's configured wallets.
 */
export async function getSupportedCoins(options: {
  business_id?: string;
  active_only?: boolean;
} = {}): Promise<SupportedCoinsResponse> {
  const apiKey = process.env.COINPAY_API_KEY;
  const businessId = options.business_id || process.env.COINPAY_MERCHANT_ID;

  if (!apiKey) {
    throw new Error("CoinPayPortal credentials not configured");
  }

  const url = new URL(`${COINPAY_API_URL}/supported-coins`);
  if (businessId) url.searchParams.set("business_id", businessId);
  if (options.active_only !== false) url.searchParams.set("active_only", "true");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `Supported coins fetch failed: ${response.status}`);
  }

  return response.json();
}

export async function resolveSupportedPaymentCurrency(
  preferredCoin?: string | null,
  options: { business_id?: string } = {}
): Promise<SupportedCurrency> {
  const coins = await getBusinessWalletCurrencies({
    business_id: options.business_id,
  });

  if (preferredCoin) {
    const preferred = coins.find((coin) => coinMatchesPreference(coin, preferredCoin));
    const currency = preferred ? coinToPaymentCurrency(preferred) : null;
    if (currency) return currency;

    throw new Error(
      `CoinPayPortal does not have an active ${preferredCoin} wallet configured`
    );
  }

  const firstSupported = coins.map(coinToPaymentCurrency).find(Boolean);
  if (firstSupported) return firstSupported;

  throw new Error("CoinPayPortal has no active wallet currencies configured");
}

// ─── Payment Status API ────────────────────────────────────────────────────

export interface PaymentStatusResponse {
  success: boolean;
  payment: {
    id: string;
    status: string;
    tx_hash?: string | null;
    forward_tx_hash?: string | null;
    confirmed_at?: string | null;
    blockchain?: string;
    crypto_amount?: string;
    payment_address?: string;
  };
}

/**
 * Get payment status from CoinPayPortal
 */
export async function getPaymentStatus(paymentId: string): Promise<PaymentStatusResponse> {
  const apiKey = process.env.COINPAY_API_KEY;

  if (!apiKey) {
    throw new Error("CoinPayPortal credentials not configured");
  }

  const response = await fetch(`${COINPAY_API_URL}/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `Payment status failed: ${response.status}`);
  }

  return response.json();
}

// ─── Escrow API ────────────────────────────────────────────────────────────

export interface CreateEscrowOptions {
  amount_usd: number;
  currency: SupportedCurrency;
  depositor_email: string;
  beneficiary_email: string;
  depositor_address: string;
  beneficiary_address: string;
  description?: string;
  auto_release_hours?: number;
  webhook_url?: string;
  metadata?: Record<string, unknown>;
}

export interface EscrowResponse {
  success: boolean;
  escrow: {
    id: string;
    status: string;
    amount: number;
    chain: string;
    escrow_address?: string;
    payment_address?: string;
    checkout_url?: string;
    expires_at?: string;
    amount_usd?: number;
  };
}

export interface EscrowStatusResponse {
  success: boolean;
  escrow: {
    id: string;
    status: string;
    amount: number;
    currency: string;
    funded_at?: string;
    released_at?: string;
    refunded_at?: string;
    tx_hash?: string;
  };
}

/**
 * Create an escrow via CoinPayPortal
 */
export async function createEscrow(
  options: CreateEscrowOptions
): Promise<EscrowResponse> {
  const apiKey = process.env.COINPAY_API_KEY;
  const merchantId = process.env.COINPAY_MERCHANT_ID;

  if (!apiKey || !merchantId) {
    throw new Error("CoinPayPortal credentials not configured");
  }

  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";

  const response = await fetch(`${COINPAY_API_URL}/escrow`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      business_id: merchantId,
      amount_usd: options.amount_usd,
      currency: options.currency,
      depositor_address: options.depositor_address,
      beneficiary_address: options.beneficiary_address,
      depositor_email: options.depositor_email,
      beneficiary_email: options.beneficiary_email,
      description: options.description,
      auto_release_hours: options.auto_release_hours,
      webhook_url: options.webhook_url || `${appUrl}/api/payments/coinpayportal/webhook`,
      metadata: options.metadata,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    const msg = error.message || error.error || error.detail || JSON.stringify(error);
    console.error("[CoinPayPortal] Escrow creation failed:", response.status, error);
    throw new Error(msg || `Escrow creation failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Release escrow funds to the beneficiary
 */
export async function releaseEscrow(escrowId: string): Promise<EscrowStatusResponse> {
  const apiKey = process.env.COINPAY_API_KEY;

  if (!apiKey) {
    throw new Error("CoinPayPortal credentials not configured");
  }

  const response = await fetch(`${COINPAY_API_URL}/escrow/${escrowId}/release`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `Escrow release failed: ${response.status}`);
  }

  return response.json();
}

// ─── Invoice API ───────────────────────────────────────────────────────────

export interface CreateInvoiceOptions {
  amount: number;
  currency?: string;
  crypto_currency?: string;
  client_id?: string;
  due_date?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface InvoiceResponse {
  success: boolean;
  invoice: {
    id: string;
    status: string;
    amount: number;
    currency: string;
    pay_url?: string;
    created_at?: string;
  };
}

/**
 * Create an invoice via CoinPayPortal
 */
export async function createInvoice(
  options: CreateInvoiceOptions
): Promise<InvoiceResponse> {
  const apiKey = process.env.COINPAY_API_KEY;
  const merchantId =
    process.env.COINPAY_UGIG_BUSINESS_ID ||
    process.env.COINPAY_BUSINESS_ID ||
    process.env.BUSINESS_ID ||
    process.env.COINPAY_MERCHANT_ID;

  if (!apiKey || !merchantId) {
    throw new Error("CoinPayPortal credentials not configured");
  }

  const response = await fetch(`${COINPAY_API_URL}/invoices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      business_id: merchantId,
      amount: options.amount,
      currency: options.currency || "USD",
      crypto_currency: options.crypto_currency,
      client_id: options.client_id,
      due_date: options.due_date,
      notes: options.notes,
      metadata: options.metadata,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `Invoice creation failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Send an invoice (generates payment link) via CoinPayPortal
 */
export async function sendInvoice(invoiceId: string): Promise<InvoiceResponse> {
  const apiKey = process.env.COINPAY_API_KEY;

  if (!apiKey) {
    throw new Error("CoinPayPortal credentials not configured");
  }

  const response = await fetch(`${COINPAY_API_URL}/invoices/${invoiceId}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `Invoice send failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Get escrow status from CoinPayPortal
 */
export async function getEscrowStatus(escrowId: string): Promise<EscrowStatusResponse> {
  const apiKey = process.env.COINPAY_API_KEY;

  if (!apiKey) {
    throw new Error("CoinPayPortal credentials not configured");
  }

  const response = await fetch(`${COINPAY_API_URL}/escrow/${escrowId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `Escrow status failed: ${response.status}`);
  }

  return response.json();
}
