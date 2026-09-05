import { createGateway } from "@profullstack/x402-gateway";
import { x402Proxy } from "@profullstack/x402-gateway/next";
import { getAppUrl } from "@/lib/app-url";

/**
 * Sells crawl access to AI training crawlers (GPTBot, ClaudeBot, CCBot,
 * meta-externalagent, Bytespider, Applebot-Extended, ...) by the day over
 * x402, settled by CoinPay in USDC. People, Googlebot and the retrieval
 * crawlers behind AI search (OAI-SearchBot, Claude-SearchBot, PerplexityBot,
 * ...) pass through untouched.
 *
 * Runs inside proxy.ts, so nothing here may import Node-only modules.
 * Without COINPAY_X402_KEY and CRAWL_PAY_TO the gateway still answers
 * training crawlers with 402, just with an empty offer: nothing is sold, but
 * nothing is given away either.
 */
export const gateway = createGateway({
  siteUrl: getAppUrl(),
  siteName: "ugig",
  coinpay: { apiKey: process.env.COINPAY_X402_KEY },
  payTo: process.env.CRAWL_PAY_TO,
  contact: "mailto:support@ugig.net",
});

/** Resolves to a Response for a refused crawler, or undefined to carry on. */
export const gate = x402Proxy(gateway);
