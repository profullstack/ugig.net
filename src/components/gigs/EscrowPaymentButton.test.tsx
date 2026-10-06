import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EscrowPaymentButton } from "./EscrowPaymentButton";

const baseProps = {
  gigId: "g1",
  applicationId: "a1",
  currentUserId: "u1",
  isPoster: true,
  isWorker: false,
  workerId: "w1",
};

describe("EscrowPaymentButton fee disclosure", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ poster_addresses: [], worker_addresses: [] }))
    );
  });

  it("shows the 5% fee and what the worker receives before the escrow is created", () => {
    render(<EscrowPaymentButton {...baseProps} budgetAmount={100} />);
    const breakdown = screen.getByTestId("escrow-fee-breakdown");
    expect(breakdown).toHaveTextContent("You deposit: $100");
    expect(breakdown).toHaveTextContent("Platform fee (5%, deducted on release): $5");
    expect(breakdown).toHaveTextContent("Worker receives: $95");
    // Nothing has been posted to the escrow route yet.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("keeps the breakdown on the currency step, next to the fund button", async () => {
    render(<EscrowPaymentButton {...baseProps} budgetAmount={100} />);
    fireEvent.click(screen.getByRole("button", { name: /fund escrow/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("escrow-fee-breakdown")).toHaveTextContent("Worker receives: $95");
    expect(screen.getByRole("button", { name: /fund \$100 escrow/i })).toBeInTheDocument();
  });

  it("shows sats gigs in sats, not dollars", () => {
    render(<EscrowPaymentButton {...baseProps} budgetAmount={5000} amountUnit="sats" />);
    expect(screen.getByRole("button", { name: /fund escrow \(5,000 sats\)/i })).toBeInTheDocument();
    const breakdown = screen.getByTestId("escrow-fee-breakdown");
    expect(breakdown).toHaveTextContent("250 sats");
    expect(breakdown).toHaveTextContent("Worker receives: 4,750 sats");
  });

  it("shows no breakdown to a worker", () => {
    render(
      <EscrowPaymentButton {...baseProps} isPoster={false} isWorker budgetAmount={100} />
    );
    expect(screen.queryByTestId("escrow-fee-breakdown")).not.toBeInTheDocument();
  });
});
