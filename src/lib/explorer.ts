/**
 * Block explorer links for on-chain payments.
 *
 * Payments settle on whatever chain the invoice was quoted in, and the chain is
 * only ever recorded as a CoinPay currency key (`usdt_pol`), a blockchain name
 * ("polygon"), or a bare coin symbol ("POL") depending on which code path wrote
 * it. Normalizing all three here keeps the receipt UI from having to guess.
 */

export type ExplorerChain = "bitcoin" | "bitcoin-cash" | "ethereum" | "polygon" | "solana";

interface ExplorerDef {
  /** Human name of the explorer, shown on the link. */
  name: string;
  /** Builds the transaction detail URL for a hash. */
  txUrl: (hash: string) => string;
}

const EXPLORERS: Record<ExplorerChain, ExplorerDef> = {
  bitcoin: {
    name: "mempool.space",
    txUrl: (hash) => `https://mempool.space/tx/${hash}`,
  },
  "bitcoin-cash": {
    name: "Blockchair",
    txUrl: (hash) => `https://blockchair.com/bitcoin-cash/transaction/${hash}`,
  },
  ethereum: {
    name: "Etherscan",
    txUrl: (hash) => `https://etherscan.io/tx/${hash}`,
  },
  polygon: {
    name: "PolygonScan",
    txUrl: (hash) => `https://polygonscan.com/tx/${hash}`,
  },
  solana: {
    name: "Solscan",
    txUrl: (hash) => `https://solscan.io/tx/${hash}`,
  },
};

/**
 * Chain for a currency identifier. Accepts CoinPay currency keys
 * (`btc`, `usdc_pol`), blockchain names ("Bitcoin Cash", "polygon"), and bare
 * symbols ("BTC", "MATIC"). Token currencies resolve to their settlement chain:
 * USDC on Polygon is a Polygon transaction, so it belongs on PolygonScan.
 */
export function explorerChain(currency?: string | null): ExplorerChain | null {
  const key = (currency || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!key) return null;

  // Whole key first ("bitcoin_cash" is a chain, not bitcoin + a suffix). Then
  // the chain suffix of a token key (usdc_pol, usdt_eth) — the token says
  // nothing about where the transaction landed, the suffix does.
  const [head, ...rest] = key.split("_");
  const tail = rest.join("_");

  return chainFromToken(key) ?? chainFromToken(tail) ?? chainFromToken(head);
}

function chainFromToken(token: string): ExplorerChain | null {
  switch (token) {
    case "btc":
    case "bitcoin":
      return "bitcoin";
    case "bch":
    case "bitcoin_cash":
    case "bitcoincash":
      return "bitcoin-cash";
    case "eth":
    case "ethereum":
    case "erc20":
      return "ethereum";
    case "pol":
    case "matic":
    case "polygon":
      return "polygon";
    case "sol":
    case "solana":
      return "solana";
    // Bare stablecoin with no chain suffix. CoinPay's plain `usdt` is the
    // Ethereum contract (its address validation requires an 0x address).
    case "usdt":
    case "usdc":
      return "ethereum";
    default:
      return null;
  }
}

/** Explorer transaction URL, or null when the chain or hash is unknown. */
export function explorerTxUrl(
  currency?: string | null,
  txHash?: string | null
): string | null {
  const hash = (txHash || "").trim();
  if (!hash) return null;
  const chain = explorerChain(currency);
  if (!chain) return null;
  return EXPLORERS[chain].txUrl(encodeURIComponent(hash));
}

/** Display name of the explorer for a currency (e.g. "Etherscan"). */
export function explorerName(currency?: string | null): string | null {
  const chain = explorerChain(currency);
  return chain ? EXPLORERS[chain].name : null;
}

/**
 * Middle-truncated hash for display. Transaction hashes are too long to show in
 * a list row, but the head and tail are what people compare against a wallet.
 */
export function shortTxHash(hash?: string | null, edge = 10): string {
  const value = (hash || "").trim();
  if (!value) return "";
  if (value.length <= edge * 2 + 3) return value;
  return `${value.slice(0, edge)}…${value.slice(-edge)}`;
}
