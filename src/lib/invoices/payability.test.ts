import { describe, it, expect } from "vitest";
import { invoiceUnpayableReason } from "./payability";

const WALLET = {
  merchant_wallet_address: "So11111111111111111111111111111111111111112",
  receiver_payment_currency: "sol",
};

describe("invoiceUnpayableReason", () => {
  it("is null for an open invoice with a wallet and a healthy worker link", () => {
    // No coinpay_invoice_id yet is normal: it is minted when the poster pays.
    expect(invoiceUnpayableReason({ status: "sent", metadata: WALLET }, "connected")).toBeNull();
  });

  it("flags an open invoice with no receiving wallet", () => {
    expect(invoiceUnpayableReason({ status: "sent", metadata: {} }, "connected")).toBe(
      "missing_wallet"
    );
    expect(
      invoiceUnpayableReason(
        { status: "expired", metadata: { merchant_wallet_address: "  " } },
        "connected"
      )
    ).toBe("missing_wallet");
  });

  it("flags an open invoice whose worker must reconnect", () => {
    expect(invoiceUnpayableReason({ status: "sent", metadata: WALLET }, "needs_reconnect")).toBe(
      "worker_reconnect"
    );
    expect(invoiceUnpayableReason({ status: "sent", metadata: WALLET }, "none")).toBe(
      "worker_reconnect"
    );
  });

  it("does not flag a live quote, which can be paid regardless of the link", () => {
    expect(
      invoiceUnpayableReason(
        {
          status: "sent",
          metadata: {
            ...WALLET,
            payment_address: "deposit",
            expires_at: new Date(Date.now() + 60_000).toISOString(),
          },
        },
        "needs_reconnect"
      )
    ).toBeNull();
  });

  it("ignores closed invoices and unknown link state", () => {
    expect(invoiceUnpayableReason({ status: "paid", metadata: {} }, "none")).toBeNull();
    expect(invoiceUnpayableReason({ status: "sent", metadata: WALLET }, null)).toBeNull();
  });
});
