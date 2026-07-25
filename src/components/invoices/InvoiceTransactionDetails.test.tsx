import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InvoiceTransactionDetails } from "./InvoiceTransactionDetails";

describe("InvoiceTransactionDetails", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the transaction id and a block explorer link for a paid invoice", () => {
    render(
      <InvoiceTransactionDetails
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
      <InvoiceTransactionDetails
        metadata={{
          payment_currency: "btc",
          tx_hash: "aaa111",
          merchant_tx_hash: "bbb222",
        }}
        coinpayInvoiceId="cp-456"
      />
    );

    expect(screen.getByText("Payment received")).toBeInTheDocument();
    expect(screen.getByText("Payout to worker")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /mempool\.space/i })).toHaveLength(2);
  });

  it("flags a payer-broadcast hash as awaiting confirmation", () => {
    render(
      <InvoiceTransactionDetails
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
      <InvoiceTransactionDetails
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
    render(<InvoiceTransactionDetails metadata={{}} coinpayInvoiceId="cp-789" />);

    expect(
      screen.getByText(/No on-chain transaction was recorded/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Payment reference cp-789/)).toBeInTheDocument();
  });
});
