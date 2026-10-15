import { describe, it, expect } from "vitest";
import { checkPayoutWallet, payoutCurrencyKey, profilePayoutWallets } from "./profile-payout-wallets";

const SOL = "FX8QhU1TPUiTeVfkpRhzDvPFYvCwfPZxbHLnwNBoS3Ui";
const EVM = "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28";

describe("profile payout wallets", () => {
  it("accepts only exact CoinPay currency keys", () => {
    expect(payoutCurrencyKey("usdc_sol")).toBe("usdc_sol");
    expect(payoutCurrencyKey("USDC-SOL")).toBe("usdc_sol");
    expect(payoutCurrencyKey("usdc")).toBeNull();
    expect(payoutCurrencyKey("USDC (Solana)")).toBeNull();
    expect(payoutCurrencyKey("lightning")).toBeNull();
  });

  it("refuses plain usdt, which names no chain", () => {
    expect(checkPayoutWallet({ currency: "usdt", address: EVM })).toEqual({ ok: false, reason: "unknown_currency" });
  });

  it("refuses an address that is invalid for its chain", () => {
    expect(checkPayoutWallet({ currency: "eth", address: SOL })).toEqual({ ok: false, reason: "invalid_address" });
    expect(checkPayoutWallet({ currency: "sol", address: ` ${SOL} ` })).toEqual({ ok: true, currency: "sol", address: SOL });
  });

  it("keeps one wallet per coin, preferred first, limited to the allowed coins", () => {
    const wallets = profilePayoutWallets(
      [
        { currency: "sol", address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" },
        { currency: "sol", address: SOL, is_preferred: true },
        { currency: "usdt_pol", address: EVM },
        { currency: "usdc", address: EVM },
        { currency: "eth", address: "nope" },
      ],
      ["sol", "eth"],
    );
    expect(wallets.map((w) => [w.currency, w.address])).toEqual([["sol", SOL]]);
  });

  it("tolerates a non-array column", () => {
    expect(profilePayoutWallets(null)).toEqual([]);
    expect(profilePayoutWallets({})).toEqual([]);
  });
});
