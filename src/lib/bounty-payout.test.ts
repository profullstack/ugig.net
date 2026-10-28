import { describe, expect, it } from "vitest";
import { bountyPayoutCoin, bountyPayoutReadiness, pickBountyPayoutWallet } from "./bounty-payout";

const SOL = "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV";
const EVM = "0x5C26910a0F64F7Bbd2970C33D45e67a950F7ff26";

describe("bountyPayoutCoin", () => {
  it("maps CoinPay coins", () => {
    expect(bountyPayoutCoin("SOL")).toEqual({ kind: "currency", currency: "sol" });
  });
  it("treats a missing coin and plain USDT as any payable wallet", () => {
    expect(bountyPayoutCoin(null)).toEqual({ kind: "any" });
    expect(bountyPayoutCoin("")).toEqual({ kind: "any" });
    expect(bountyPayoutCoin("USDT")).toEqual({ kind: "any" });
  });
  it("leaves a token CoinPay cannot pay to the creator", () => {
    expect(bountyPayoutCoin("FLAPJAX")).toEqual({ kind: "unsupported", coin: "FLAPJAX" });
  });
});

describe("pickBountyPayoutWallet", () => {
  const profile = [
    { currency: "usdc_pol", address: EVM, is_preferred: true },
    { currency: "sol", address: SOL },
  ];

  it("pays an API-key agent's profile wallet in the bounty's coin", () => {
    const w = pickBountyPayoutWallet({ coin: { kind: "currency", currency: "sol" }, linkWallets: null, profileWalletAddresses: profile });
    expect(w).toMatchObject({ currency: "sol", address: SOL, source: "profile", exact: true });
  });

  it("falls back to the preferred profile wallet when the bounty's coin is missing", () => {
    const w = pickBountyPayoutWallet({
      coin: { kind: "currency", currency: "sol" },
      linkWallets: null,
      profileWalletAddresses: [{ currency: "usdc_pol", address: EVM }],
    });
    expect(w).toMatchObject({ currency: "usdc_pol", address: EVM, source: "profile", exact: false });
  });

  it("prefers an exact CoinPay-link wallet, then an exact profile wallet, over a linked other coin", () => {
    const link = [{ currency: "eth" as const, cryptocurrency: "ETH", label: null, address: EVM, network: null }];
    const w = pickBountyPayoutWallet({ coin: { kind: "currency", currency: "sol" }, linkWallets: link, profileWalletAddresses: profile });
    expect(w).toMatchObject({ currency: "sol", source: "profile", exact: true });
  });

  it("never pays an unchained or invalid profile entry", () => {
    const w = pickBountyPayoutWallet({
      coin: { kind: "any" },
      linkWallets: null,
      profileWalletAddresses: [
        { currency: "usdt", address: "TXYZ" },
        { currency: "usdc", address: EVM },
        { currency: "sol", address: "not-an-address" },
      ],
    });
    expect(w).toBeNull();
  });

  it("refuses unsupported coins", () => {
    expect(
      pickBountyPayoutWallet({ coin: { kind: "unsupported", coin: "FLAPJAX" }, linkWallets: null, profileWalletAddresses: profile })
    ).toBeNull();
  });
});

describe("bountyPayoutReadiness", () => {
  it("is ready with the address it will pay, and says no human step is needed", () => {
    const r = bountyPayoutReadiness({ paymentCoin: "SOL", linkWallets: null, profileWalletAddresses: [{ currency: "sol", address: SOL }] });
    expect(r).toMatchObject({ ready: true, currency: "sol", source: "profile", address: SOL });
    expect(r.message).toMatch(/No account, claim code or human step/);
    expect(r.api_fix).toBeUndefined();
  });

  it("names the one API call that fixes a missing wallet, bounty coin first", () => {
    const r = bountyPayoutReadiness({ paymentCoin: "SOL", linkWallets: null, profileWalletAddresses: [] });
    expect(r.ready).toBe(false);
    expect(r.api_fix).toMatchObject({ method: "PUT", path: "/api/profile/wallet-addresses", no_coinpay_account_needed: true });
    expect(r.api_fix?.currencies[0]).toBe("sol");
  });

  it("explains off-platform tokens without offering a fix it cannot honour", () => {
    const r = bountyPayoutReadiness({ paymentCoin: "FLAPJAX", linkWallets: null, profileWalletAddresses: [] });
    expect(r.ready).toBe(false);
    expect(r.api_fix).toBeUndefined();
    expect(r.message).toMatch(/FLAPJAX/);
  });
});
