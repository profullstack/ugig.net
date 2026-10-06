import { FUNDING_LIFETIME_THRESHOLD_USD } from "@/lib/plans";

/**
 * Funding tier definitions matching docs/funding.md
 */

export const FUNDING_TIERS = {
  credits_100k: {
    id: "credits_100k" as const,
    label: "100k Credits",
    creditsAwarded: 100_000, // $100 worth
    usdValue: 100,
    description: "$100 in platform credits",
  },
  credits_500k: {
    id: "credits_500k" as const,
    label: "500k Credits",
    creditsAwarded: 600_000, // $600 worth (discount)
    usdValue: 600,
    description: "$600 in platform credits (20% bonus)",
  },
  credits_1m: {
    id: "credits_1m" as const,
    label: "1M Credits",
    creditsAwarded: 1_500_000, // $1500 worth (discount)
    usdValue: 1500,
    description: "$1,500 in platform credits (50% bonus)",
  },
  lifetime: {
    id: "lifetime" as const,
    label: "Lifetime Membership",
    creditsAwarded: 0,
    usdValue: FUNDING_LIFETIME_THRESHOLD_USD,
    description: "Lifetime membership: the Pro plan forever (unlimited gig posts, 2% marketplace seller fee)",
  },
  supporter: {
    id: "supporter" as const,
    label: "Supporter",
    creditsAwarded: 0,
    usdValue: 1,
    description: "Thank-you contribution (no perks attached)",
  },
} as const;

/** Cached BTC/USD rate */
let btcRateCache: { rate: number; ts: number } | null = null;
const RATE_CACHE_MS = 5 * 60 * 1000; // 5 min

/**
 * Fetch the current BTC/USD rate from CoinPayPortal.
 * Uses a 5-minute cache to avoid hammering the API.
 */
export async function getBtcRate(): Promise<number> {
  if (btcRateCache && Date.now() - btcRateCache.ts < RATE_CACHE_MS) {
    return btcRateCache.rate;
  }

  const res = await fetch("https://coinpayportal.com/api/rates?coin=BTC", {
    cache: "no-store",
  });
  const data = await res.json();

  if (!data.success || !data.rate) {
    if (btcRateCache) return btcRateCache.rate; // stale cache fallback
    throw new Error("Failed to fetch BTC rate");
  }

  btcRateCache = { rate: data.rate, ts: Date.now() };
  return data.rate;
}

/**
 * Convert USD to satoshis using live BTC rate.
 * 1 BTC = 100,000,000 sats
 */
export async function usdToSats(usd: number): Promise<number> {
  const btcRate = await getBtcRate();
  const btc = usd / btcRate;
  const sats = Math.round(btc * 100_000_000);
  return sats;
}

/** Reset BTC rate cache (for testing) */
export function _resetBtcRateCache() {
  btcRateCache = null;
}

export type FundingTierId = keyof typeof FUNDING_TIERS;

export const VALID_FUNDING_TIERS: FundingTierId[] = Object.keys(FUNDING_TIERS) as FundingTierId[];

/** The USD threshold for automatic lifetime membership (see src/lib/plans.ts) */
export const LIFETIME_THRESHOLD_USD = FUNDING_LIFETIME_THRESHOLD_USD;

/** Invoice expiry in seconds (10 minutes) */
export const INVOICE_EXPIRY_SECONDS = 600;

/** Public funding wallet addresses */
export const FUNDING_ADDRESSES = {
  BTC: "165y3LYwtbPythyYDKU1DzReT7E74tZGMh",
  ETH: "0xEf993488b444b75585A5CCe171e65F4dD9D99add",
  SOL: "FX8QhU1TPUHGs2X8PibbHikd4YvdQMPfVuFd6mqk9qJw",
  POL: "0xEf993488b444b75585A5CCe171e65F4dD9D99add",
  BCH: "bitcoincash:qr06y3frs7qq9lfn0w0dkfuvcrclmsvgnvwdu203k0",
  USDC_ETH: "0xEf993488b444b75585A5CCe171e65F4dD9D99add",
  USDC_SOL: "FX8QhU1TPUHGs2X8PibbHikd4YvdQMPfVuFd6mqk9qJw",
  USDC_POL: "0xEf993488b444b75585A5CCe171e65F4dD9D99add",
  ADA: "addr1vyg2h3pzgmy7lpcz7xltep32wa9qn4rdzgaf356h7fnydjcsyr6kw",
  BNB: "0xEf993488b444b75585A5CCe171e65F4dD9D99add",
  USDT_ETH: "0xEf993488b444b75585A5CCe171e65F4dD9D99add",
  DOGE: "D8VUXEz2UBDQcbjZ4fDZU9J8XrdXEjow8P",
  XRP: "rUn3s5Tjh81bTMz7LtaRes1KFuRhaZxn6Z",
  USDT_SOL: "FX8QhU1TPUHGs2X8PibbHikd4YvdQMPfVuFd6mqk9qJw",
  USDT_POL: "0xEf993488b444b75585A5CCe171e65F4dD9D99add",
} as const;

export type FundingAddressMap = Record<string, string>;

const COINPAY_API = "https://coinpayportal.com/api";

/**
 * Pull deposit addresses from CoinPay business API.
 * Fails hard when CoinPay data is unavailable or invalid.
 */
export async function getFundingAddresses(): Promise<FundingAddressMap> {
  const apiKey = process.env.COINPAY_API_KEY;
  const businessId = process.env.COINPAY_MERCHANT_ID;

  if (!apiKey || !businessId) {
    throw new Error("CoinPay credentials are required for funding addresses");
  }

  const res = await fetch(`${COINPAY_API}/businesses`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`CoinPay businesses API failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    businesses?: Array<Record<string, unknown>>;
  };

  const business = data?.businesses?.find((b) => b?.id === businessId);
  if (!business) {
    throw new Error(`CoinPay business not found: ${businessId}`);
  }

  const candidates = [
    business.deposit_addresses,
    business.depositAddresses,
    business.wallet_addresses,
    business.walletAddresses,
    business.addresses,
    business.wallets,
    business.coins,
  ] as unknown[];

  const parsed: Record<string, string> = {};

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    for (const [k, v] of Object.entries(candidate as Record<string, unknown>)) {
      if (typeof v !== "string" || !v.trim()) continue;
      parsed[k.toUpperCase()] = v;
    }
  }

  if (Object.keys(parsed).length === 0) {
    throw new Error("CoinPay returned no deposit addresses for funding business");
  }

  return parsed;
}
