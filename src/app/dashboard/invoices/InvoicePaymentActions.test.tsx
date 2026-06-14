import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InvoicePaymentActions } from "./InvoicePaymentActions";

vi.mock("@/components/funding/QRCode", () => ({
  QRCodeCanvas: ({ value }: { value: string }) => <div data-testid="qr-code">{value}</div>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const baseProps = {
  invoiceId: "inv-1",
  gigId: "gig-1",
  applicationId: "app-1",
  amountUsd: 12,
  currency: "USD",
  payUrl: null,
  notes: "Work completed",
  dueDate: null,
};

describe("InvoicePaymentActions", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows in-app crypto payment details for sent invoices", () => {
    render(
      <InvoicePaymentActions
        {...baseProps}
        status="sent"
        metadata={{
          payment_address: "SolAddress123",
          amount_crypto: "0.25",
          payment_currency: "SOL",
          expires_at: "2030-01-01T00:00:00Z",
        }}
      />
    );

    expect(screen.getByText("Invoice payment")).toBeInTheDocument();
    expect(screen.getByText("0.25 SOL")).toBeInTheDocument();
    expect(screen.getByText("SolAddress123")).toBeInTheDocument();
  });

  it("creates a fresh payment request for an expired payment window", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          pay_url: null,
          metadata: {
            payment_address: "NewSolAddress456",
            amount_crypto: "0.5",
            payment_currency: "SOL",
            expires_at: "2030-01-01T00:00:00Z",
          },
        },
      }),
    });

    render(
      <InvoicePaymentActions
        {...baseProps}
        status="expired"
        metadata={{
          payment_address: "OldSolAddress123",
          amount_crypto: "0.25",
          payment_currency: "SOL",
        }}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: /pay now/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/gigs/gig-1/invoice/inv-1/payment-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    });

    await waitFor(() => {
      expect(screen.getByText("NewSolAddress456")).toBeInTheDocument();
    });
    expect(screen.getByText("0.5 SOL")).toBeInTheDocument();
  });

  it("can create a payment request when payment details are missing", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          pay_url: null,
          metadata: {
            payment_address: "NewSolAddress456",
            amount_crypto: "0.5",
            payment_currency: "SOL",
            expires_at: "2030-01-01T00:00:00Z",
          },
        },
      }),
    });

    render(<InvoicePaymentActions {...baseProps} status="sent" metadata={null} />);

    fireEvent.click(await screen.findByRole("button", { name: /pay now/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/gigs/gig-1/invoice/inv-1/payment-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    });

    await waitFor(() => {
      expect(screen.getByText("NewSolAddress456")).toBeInTheDocument();
    });
    expect(screen.getByText("0.5 SOL")).toBeInTheDocument();
  });

  it("accepts an invoice and shows it will be paid soon", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { invoice_id: "inv-1", accepted_at: "2030-01-01T00:00:00Z" },
      }),
    });

    render(<InvoicePaymentActions {...baseProps} status="sent" metadata={null} />);

    fireEvent.click(await screen.findByRole("button", { name: /^accept$/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/gigs/gig-1/invoice/inv-1/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/will be paid soon/i)).toBeInTheDocument();
    });
  });

  it("shows the accepted indicator when already accepted", () => {
    render(
      <InvoicePaymentActions
        {...baseProps}
        status="sent"
        metadata={{ accepted_at: "2030-01-01T00:00:00Z" }}
      />
    );

    expect(screen.getByText(/will be paid soon/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^accept$/i })
    ).not.toBeInTheDocument();
  });
});
