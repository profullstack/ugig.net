import crypto from "crypto";

const COINPAY_API_URL = "https://coinpayportal.com/api";

export interface CoinPayWebhookPayload {
  id: string;
  type:
    | "payment.confirmed"
    | "payment.forwarded"
    | "payment.expired"
    | "payment.failed"
    | "escrow.funded"
    | "escrow.released"
    | "escrow.refunded"
    | "escrow.disputed";
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
  currency:
    | "usdc_pol"
    | "usdc_sol"
    | "usdc_eth"
    | "usdt"
    | "usdt_eth"
    | "usdt_pol"
    | "usdt_sol"
    | "pol"
    | "sol"
    | "btc"
    | "bch"
    | "eth";
  description?: string;
  redirect_url?: string;
  expires_at?: string;
  expires_in?: number;
  metadata?: Record<string, unknown>;
  business_id?: string;
  merchant_wallet_address?: string;
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

export interface CoinPayGlobalWallet {
  id?: string;
  currency: SupportedCurrency;
  cryptocurrency: string;
  label: string | null;
  address: string;
  network: string | null;
  raw?: Record<string, unknown>;
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
export async function createPayment(options: CreatePaymentOptions): Promise<CreatePaymentResponse> {
  const apiKey = process.env.COINPAY_API_KEY;
  const merchantId = options.business_id || process.env.COINPAY_MERCHANT_ID;
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";

  if (!apiKey || !merchantId) {
    throw new Error("CoinPayPortal credentials not configured");
  }

  const response = await fetch(`${COINPAY_API_URL}/payments/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
    body: JSON.stringify({
      business_id: merchantId,
      amount_usd: options.amount_usd,
      payment_method: "crypto",
      currency: options.currency,
      description: options.description,
      success_url: options.redirect_url || appUrl,
      cancel_url: options.redirect_url || appUrl,
      redirect_url: options.redirect_url,
      expires_at: options.expires_at,
      expires_in: options.expires_in,
      webhook_url: `${appUrl}/api/webhooks/coinpay`,
      merchant_wallet_address: options.merchant_wallet_address,
      metadata: options.metadata,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[coinpayportal] create payment failed ${response.status}: ${text}`);

    let message = text;
    try {
      const error = JSON.parse(text) as {
        message?: string;
        error?: string;
      };
      message = error.message || error.error || text;
    } catch {
      // Keep the raw text when CoinPay does not return JSON.
    }

    throw new Error(
      message
        ? `CoinPay create failed ${response.status}: ${message.slice(0, 300)}`
        : `CoinPay create failed ${response.status}`
    );
  }

  const json = await response.json();
  console.log(
    "[coinpayportal] create payment response:",
    JSON.stringify({
      success: json?.success,
      payment_id: json?.payment_id || json?.payment?.id,
      currency: json?.currency || json?.payment?.currency,
      has_address: Boolean(json?.address || json?.payment?.payment_address),
      has_checkout_url: Boolean(json?.checkout_url || json?.payment?.checkout_url),
    })
  );
  return json;
}

/**
 * Get supported currencies with their display names
 */
export const SUPPORTED_CURRENCIES = {
  usdc_pol: { name: "USDC (Polygon)", symbol: "USDC" },
  usdc_sol: { name: "USDC (Solana)", symbol: "USDC" },
  usdc_eth: { name: "USDC (Ethereum)", symbol: "USDC" },
  usdt: { name: "USDT", symbol: "USDT" },
  usdt_eth: { name: "USDT (Ethereum)", symbol: "USDT" },
  usdt_pol: { name: "USDT (Polygon)", symbol: "USDT" },
  usdt_sol: { name: "USDT (Solana)", symbol: "USDT" },
  pol: { name: "Polygon", symbol: "POL" },
  sol: { name: "Solana", symbol: "SOL" },
  btc: { name: "Bitcoin", symbol: "BTC" },
  bch: { name: "Bitcoin Cash", symbol: "BCH" },
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
    normalizeCoinSymbol(coin.id) || normalizeCoinSymbol(coin.chain);
  const chain =
    normalizeCoinSymbol(coin.chain) ||
    normalizeCoinSymbol(coin.network) ||
    normalizeCoinSymbol(coin.blockchain);

  if (symbol === "BTC") return "btc";
  if (symbol === "BCH") return "bch";
  if (symbol === "ETH") return "eth";
  if (symbol === "POL" || symbol === "MATIC") return "pol";
  if (symbol === "SOL") return "sol";
  if (symbol === "USDT") {
    if (chain === "POL" || chain === "POLYGON" || chain === "MATIC") return "usdt_pol";
    if (chain === "SOL" || chain === "SOLANA") return "usdt_sol";
    if (chain === "ETH" || chain === "ETHEREUM") return "usdt_eth";
    return "usdt";
  }
  if (symbol === "USDC") {
    if (chain === "POL" || chain === "POLYGON" || chain === "MATIC") return "usdc_pol";
    if (chain === "ETH" || chain === "ETHEREUM") return "usdc_eth";
    return "usdc_sol";
  }

  return null;
}

export function preferredCoinToPaymentCurrency(
  preferredCoin?: string | null
): SupportedCurrency | null {
  const directCurrency = normalizeCurrencyKey(preferredCoin);
  if (isSupportedCurrency(directCurrency)) return directCurrency;

  const symbol = normalizeCoinSymbol(preferredCoin);
  if (!symbol) return null;

  if (symbol === "BTC") return "btc";
  if (symbol === "BCH") return "bch";
  if (symbol === "ETH") return "eth";
  if (symbol === "POL" || symbol === "MATIC") return "pol";
  if (symbol === "SOL") return "sol";
  if (symbol === "USDT") return "usdt";
  if (symbol === "USDC") return "usdc_sol";

  return null;
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

  const addWallet = (
    currency: string | null,
    address: string | null,
    source?: Record<string, unknown>
  ) => {
    if (!currency || !address) return;
    const key = normalizeCoinSymbol(currency);
    if (!key || wallets.has(key)) return;
    wallets.set(key, {
      ...(source || {}),
      currency: key,
      address,
      is_active:
        source?.is_active === false || source?.active === false || source?.enabled === false
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
          getStringValue(record, [
            "address",
            "wallet_address",
            "walletAddress",
            "deposit_address",
            "depositAddress",
          ]),
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
          getStringValue(record, ["currency", "symbol", "coin", "chain", "network", "id"]) ||
            currency,
          getStringValue(record, [
            "address",
            "wallet_address",
            "walletAddress",
            "deposit_address",
            "depositAddress",
          ]),
          record
        );
      }
    }
  }

  return [...wallets.values()].filter((wallet) => wallet.is_active !== false);
}

function arrayFromWalletPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  const candidates = [
    record.wallets,
    record.tokens,
    record.addresses,
    record.data,
    record.result,
    record.business,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === "object") {
      const nested = arrayFromWalletPayload(candidate);
      if (nested.length > 0) return nested;
    }
  }

  return Object.entries(record).map(([key, value]) =>
    value && typeof value === "object"
      ? { ...(value as Record<string, unknown>), cryptocurrency: key, currency: key }
      : { cryptocurrency: key, currency: key, wallet_address: value }
  );
}

function normalizeGlobalWallets(payload: unknown): CoinPayGlobalWallet[] {
  const wallets = new Map<string, CoinPayGlobalWallet>();

  for (const item of arrayFromWalletPayload(payload)) {
    if (!item || typeof item !== "object") continue;

    const record = item as Record<string, unknown>;
    const cryptocurrency =
      getStringValue(record, ["cryptocurrency", "currency", "symbol", "coin", "chain", "network", "id"]) ||
      "";
    const address = getStringValue(record, [
      "wallet_address",
      "walletAddress",
      "address",
      "receiving_address",
      "receivingAddress",
      "deposit_address",
      "depositAddress",
    ]);
    const currency = coinToPaymentCurrency(record as SupportedCoin);

    if (!currency || !address) continue;
    if (record.is_active === false || record.active === false || record.enabled === false) continue;
    if (!validateCoinpayReceivingAddress(currency, address)) continue;

    const key = `${currency}:${address.toLowerCase()}`;
    if (wallets.has(key)) continue;

    wallets.set(key, {
      id: getStringValue(record, ["id", "wallet_id", "walletId"]) || undefined,
      currency,
      cryptocurrency: cryptocurrency || currency.toUpperCase(),
      label: getStringValue(record, ["label", "name"]) || null,
      address,
      network: getStringValue(record, ["network", "chain", "blockchain"]) || null,
      raw: record,
    });
  }

  return [...wallets.values()];
}

export function validateCoinpayReceivingAddress(
  currency: SupportedCurrency,
  address: string
): boolean {
  const value = address.trim();
  if (!value) return false;

  if (
    currency === "eth" ||
    currency === "pol" ||
    currency === "usdc_eth" ||
    currency === "usdc_pol" ||
    currency === "usdt" ||
    currency === "usdt_eth" ||
    currency === "usdt_pol"
  ) {
    return /^0x[a-fA-F0-9]{40}$/.test(value);
  }

  if (currency === "sol" || currency === "usdc_sol" || currency === "usdt_sol") {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
  }

  if (currency === "btc") {
    return /^(bc1[a-z0-9]{25,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(value);
  }

  if (currency === "bch") {
    return /^(bitcoincash:)?[qp][a-z0-9]{41,90}$/.test(value) ||
      /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(value);
  }

  return false;
}

export async function getCoinpayGlobalWalletTokens(
  options: {
    business_id?: string;
    access_token?: string | null;
  } = {}
): Promise<CoinPayGlobalWallet[]> {
  const apiKey = process.env.COINPAY_API_KEY;
  const businessId = options.business_id || process.env.COINPAY_MERCHANT_ID;

  // OAuth access tokens (per-user) are validated by /api/oauth/userinfo,
  // which returns the merchant's global merchant_wallets under the
  // `wallets` claim when the wallet:read scope was granted. The /api/wallets
  // and /api/get-tokens endpoints use a different verifier (merchant-login
  // JWT or business API key) and reject OAuth access tokens.
  if (options.access_token) {
    const response = await fetch(`${COINPAY_API_URL}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${options.access_token}` },
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `CoinPay userinfo failed: ${response.status}${text ? ` ${text.slice(0, 120)}` : ""}`
      );
    }

    const payload = await response.json();
    return normalizeGlobalWallets(payload?.wallets);
  }

  if (!apiKey) {
    throw new Error("CoinPayPortal credentials not configured");
  }

  const urls = [new URL(`${COINPAY_API_URL}/get-tokens`)];
  if (businessId) {
    urls.push(new URL(`${COINPAY_API_URL}/businesses/${businessId}`));
  }
  for (const url of urls) {
    if (businessId && !url.searchParams.has("business_id")) {
      url.searchParams.set("business_id", businessId);
    }
  }

  const errors: string[] = [];
  let sawSuccessfulResponse = false;

  for (const url of urls) {
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      errors.push(`${url.pathname}: ${response.status}${text ? ` ${text.slice(0, 120)}` : ""}`);
      if ([401, 403, 404].includes(response.status)) continue;
      throw new Error(`CoinPay get-tokens failed: ${response.status}`);
    }

    const payload = await response.json();
    sawSuccessfulResponse = true;
    const wallets = normalizeGlobalWallets(payload);
    if (wallets.length > 0) return wallets;
  }

  if (!sawSuccessfulResponse && errors.length > 0) {
    throw new Error(`CoinPay get-tokens failed: ${errors[0]}`);
  }

  return [];
}

export function findCoinpayGlobalWallet(
  wallets: CoinPayGlobalWallet[],
  currency: SupportedCurrency,
  address: string
): CoinPayGlobalWallet | null {
  if (!validateCoinpayReceivingAddress(currency, address)) return null;
  const expected = address.trim().toLowerCase();
  return (
    wallets.find((wallet) => wallet.currency === currency && wallet.address.toLowerCase() === expected) ||
    null
  );
}

export async function getBusinessWalletCurrencies(
  options: {
    business_id?: string;
  } = {}
): Promise<BusinessWalletCurrency[]> {
  const apiKey = process.env.COINPAY_API_KEY;
  const businessId = options.business_id || process.env.COINPAY_MERCHANT_ID;

  if (!apiKey || !businessId) {
    throw new Error("CoinPayPortal credentials not configured");
  }

  const response = await fetch(`${COINPAY_API_URL}/businesses/${businessId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `Business wallets fetch failed: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown> & {
    business?: Record<string, unknown>;
    data?: Record<string, unknown>;
  };
  const business =
    data.business ||
    data.data ||
    (data.id === businessId ? data : null);

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
export async function getSupportedCoins(
  options: {
    business_id?: string;
    active_only?: boolean;
  } = {}
): Promise<SupportedCoinsResponse> {
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
  const preferredCurrency = preferredCoinToPaymentCurrency(preferredCoin);
  if (preferredCurrency) return preferredCurrency;
  if (preferredCoin) {
    throw new Error(`CoinPayPortal payments do not support ${preferredCoin}`);
  }

  const coins = await getBusinessWalletCurrencies({
    business_id: options.business_id,
  });

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
export async function createEscrow(options: CreateEscrowOptions): Promise<EscrowResponse> {
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
      webhook_url: options.webhook_url || `${appUrl}/api/webhooks/coinpay`,
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
export async function createInvoice(options: CreateInvoiceOptions): Promise<InvoiceResponse> {
  const apiKey = process.env.COINPAY_API_KEY;
  const merchantId = process.env.COINPAY_MERCHANT_ID;

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
