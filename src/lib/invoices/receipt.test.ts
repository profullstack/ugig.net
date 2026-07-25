import { describe, it, expect } from "vitest";
import { invoiceTransactions } from "./receipt";

describe("invoiceTransactions", () => {
  it("returns the payment and payout transactions with explorer links", () => {
    const txs = invoiceTransactions({
      payment_currency: "usdc_pol",
      tx_hash: "0xpayment",
      merchant_tx_hash: "0xpayout",
    });

    expect(txs).toHaveLength(2);
    expect(txs[0]).toMatchObject({
      role: "payment",
      tx_hash: "0xpayment",
      explorer_url: "https://polygonscan.com/tx/0xpayment",
      explorer_name: "PolygonScan",
      confirmed: true,
    });
    expect(txs[1]).toMatchObject({
      role: "payout",
      tx_hash: "0xpayout",
      explorer_url: "https://polygonscan.com/tx/0xpayout",
      confirmed: true,
    });
  });

  it("omits the payout entry when it repeats the payment hash", () => {
    const txs = invoiceTransactions({
      payment_currency: "btc",
      tx_hash: "abc",
      merchant_tx_hash: "abc",
    });
    expect(txs.map((t) => t.role)).toEqual(["payment"]);
  });

  it("marks a payer-broadcast hash as unconfirmed and prefers the wallet's explorer URL", () => {
    const txs = invoiceTransactions({
      payment_currency: "eth",
      payer_tx_hash: "0xbroadcast",
      payer_tx_explorer_url: "https://etherscan.io/tx/0xbroadcast",
    });

    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({
      role: "broadcast",
      tx_hash: "0xbroadcast",
      explorer_url: "https://etherscan.io/tx/0xbroadcast",
      confirmed: false,
    });
  });

  it("derives an explorer link for a broadcast hash with no recorded URL", () => {
    const [tx] = invoiceTransactions({
      payment_currency: "sol",
      payer_tx_hash: "sig123",
    });
    expect(tx.explorer_url).toBe("https://solscan.io/tx/sig123");
    expect(tx.explorer_name).toBe("Solscan");
  });

  it("drops the broadcast claim once the confirmed hash matches it", () => {
    const txs = invoiceTransactions({
      payment_currency: "eth",
      tx_hash: "0xsame",
      payer_tx_hash: "0xsame",
    });
    expect(txs.map((t) => t.role)).toEqual(["payment"]);
  });

  it("still lists a transaction when the chain is unknown", () => {
    const [tx] = invoiceTransactions({ tx_hash: "abc", payment_currency: null });
    expect(tx).toMatchObject({ tx_hash: "abc", explorer_url: null, explorer_name: null });
  });

  it("returns nothing for missing, empty, or non-object metadata", () => {
    expect(invoiceTransactions(null)).toEqual([]);
    expect(invoiceTransactions({})).toEqual([]);
    expect(invoiceTransactions("nope")).toEqual([]);
    expect(invoiceTransactions({ tx_hash: "   " })).toEqual([]);
  });
});
