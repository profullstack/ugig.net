import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PaymentTransactionDetails } from "./PaymentTransactionDetails";

describe("PaymentTransactionDetails", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the transaction id and a block explorer link for a paid invoice", () => {
    render(
      <PaymentTransactionDetails
        metadata={{
          payment_currency: "usdc_pol",
          tx_hash: "0x1234567890abcdef1234567890abcdef",
          paid_at: "2026-07-01T12:00:00.000Z",
        }}
        coinpayInvoiceId="cp-123"
      />
    );

    expect(screen.getByText("Payment received")).toBeInTheDocument();
    expect(screen.getByText("0x12345678…7890abcdef")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /View on PolygonScan/i });
    expect(link).toHaveAttribute(
      "href",
      "https://polygonscan.com/tx/0x1234567890abcdef1234567890abcdef"
    );
    expect(screen.getByText(/Payment reference cp-123/)).toBeInTheDocument();
  });

  it("lists both the payment and the payout transaction", () => {
    render(
      <PaymentTransactionDetails
        metadata={{
          payment_currency: "btc",
          tx_hash: "aaa111",
          merchant_tx_hash: "bbb222",
        }}
        coinpayInvoiceId="cp-456"
      />
    );

    expect(screen.getByText("Payment received")).toBeInTheDocument();
    expect(screen.getByText("Payout to recipient")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /mempool\.space/i })).toHaveLength(2);
  });

  // Bounty payouts store the same metadata shape as gig invoices, including
  // the "USD" payment_currency that names no chain.
  it("renders a bounty payout receipt from the settlement chain", () => {
    render(
      <PaymentTransactionDetails
        metadata={{
          payment_currency: "USD",
          settlement_chain: "SOL",
          tx_hash: "depositSig",
          merchant_tx_hash: "payoutSig",
        }}
        coinpayInvoiceId="cp-bounty-1"
      />
    );

    const links = screen.getAllByRole("link", { name: /View on Solscan/i });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "https://solscan.io/tx/depositSig");
    expect(links[1]).toHaveAttribute("href", "https://solscan.io/tx/payoutSig");
  });

  it("flags a payer-broadcast hash as awaiting confirmation", () => {
    render(
      <PaymentTransactionDetails
        metadata={{
          payment_currency: "eth",
          payer_tx_hash: "0xbroadcast",
          payer_tx_explorer_url: "https://etherscan.io/tx/0xbroadcast",
        }}
      />
    );

    expect(screen.getByText("Broadcast by payer")).toBeInTheDocument();
    expect(screen.getByText("Awaiting confirmation")).toBeInTheDocument();
  });

  it("copies the full hash, not the truncated display value", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    render(
      <PaymentTransactionDetails
        metadata={{
          payment_currency: "eth",
          tx_hash: "0x1234567890abcdef1234567890abcdef",
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Copy transaction id/i }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("0x1234567890abcdef1234567890abcdef")
    );
    await waitFor(() => expect(screen.getByText("Copied")).toBeInTheDocument());
  });

  it("explains a paid invoice with no recorded on-chain transaction", () => {
    render(<PaymentTransactionDetails metadata={{}} coinpayInvoiceId="cp-789" />);

    expect(
      screen.getByText(/No on-chain transaction was recorded/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Payment reference cp-789/)).toBeInTheDocument();
  });
});
