import { describe, it, expect } from "vitest";
import { explorerChain, explorerName, explorerTxUrl, shortTxHash } from "./explorer";

describe("explorerChain", () => {
  it("maps CoinPay currency keys to their settlement chain", () => {
    expect(explorerChain("btc")).toBe("bitcoin");
    expect(explorerChain("bch")).toBe("bitcoin-cash");
    expect(explorerChain("eth")).toBe("ethereum");
    expect(explorerChain("pol")).toBe("polygon");
    expect(explorerChain("sol")).toBe("solana");
  });

  it("resolves tokens to the chain in their suffix, not the token", () => {
    expect(explorerChain("usdc_pol")).toBe("polygon");
    expect(explorerChain("usdt_pol")).toBe("polygon");
    expect(explorerChain("usdc_sol")).toBe("solana");
    expect(explorerChain("usdt_sol")).toBe("solana");
    expect(explorerChain("usdc_eth")).toBe("ethereum");
    expect(explorerChain("usdt_eth")).toBe("ethereum");
  });

  it("treats bare USDT/USDC as the Ethereum contract", () => {
    expect(explorerChain("usdt")).toBe("ethereum");
    expect(explorerChain("usdc")).toBe("ethereum");
  });

  it("accepts blockchain names and symbols, in any case or separator", () => {
    expect(explorerChain("Bitcoin")).toBe("bitcoin");
    expect(explorerChain("bitcoin-cash")).toBe("bitcoin-cash");
    expect(explorerChain("Bitcoin Cash")).toBe("bitcoin-cash");
    expect(explorerChain("ETHEREUM")).toBe("ethereum");
    expect(explorerChain("MATIC")).toBe("polygon");
    expect(explorerChain("Solana")).toBe("solana");
  });

  it("returns null for missing or unknown currencies", () => {
    expect(explorerChain(null)).toBeNull();
    expect(explorerChain("")).toBeNull();
    expect(explorerChain("  ")).toBeNull();
    expect(explorerChain("doge")).toBeNull();
  });
});

describe("explorerTxUrl", () => {
  it("builds explorer URLs per chain", () => {
    expect(explorerTxUrl("btc", "abc123")).toBe("https://mempool.space/tx/abc123");
    expect(explorerTxUrl("bch", "abc123")).toBe(
      "https://blockchair.com/bitcoin-cash/transaction/abc123"
    );
    expect(explorerTxUrl("eth", "0xdead")).toBe("https://etherscan.io/tx/0xdead");
    expect(explorerTxUrl("usdc_pol", "0xdead")).toBe("https://polygonscan.com/tx/0xdead");
    expect(explorerTxUrl("sol", "5xyz")).toBe("https://solscan.io/tx/5xyz");
  });

  it("returns null without a hash or a known chain", () => {
    expect(explorerTxUrl("eth", null)).toBeNull();
    expect(explorerTxUrl("eth", "   ")).toBeNull();
    expect(explorerTxUrl("doge", "abc123")).toBeNull();
    expect(explorerTxUrl(null, "abc123")).toBeNull();
  });

  it("encodes the hash so a malformed value cannot alter the URL", () => {
    expect(explorerTxUrl("eth", "abc/../evil")).toBe(
      "https://etherscan.io/tx/abc%2F..%2Fevil"
    );
  });
});

describe("explorerName", () => {
  it("names the explorer for a currency", () => {
    expect(explorerName("btc")).toBe("mempool.space");
    expect(explorerName("usdt_eth")).toBe("Etherscan");
    expect(explorerName("unknown-coin")).toBeNull();
  });
});

describe("shortTxHash", () => {
  it("middle-truncates long hashes and leaves short ones alone", () => {
    expect(shortTxHash("0x1234567890abcdef1234567890abcdef")).toBe("0x12345678…7890abcdef");
    expect(shortTxHash("short")).toBe("short");
    expect(shortTxHash(null)).toBe("");
  });
});
