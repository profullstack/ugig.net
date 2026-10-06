import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CoinpayReconnectNotice } from "./CoinpayReconnectNotice";
import { reconnectStateFrom } from "./InvoiceButton";

describe("CoinpayReconnectNotice", () => {
  afterEach(() => cleanup());

  it("gives the worker a Reconnect CoinPay button into the existing connect flow", () => {
    render(<CoinpayReconnectNotice state="needs_reconnect" canFix />);
    const link = screen.getByRole("link", { name: /reconnect coinpay/i });
    expect(link).toHaveAttribute("href", "/settings/connections");
  });

  it("says Connect, not Reconnect, when there is no link at all", () => {
    render(<CoinpayReconnectNotice state="none" canFix />);
    expect(screen.getByRole("link", { name: /^connect coinpay$/i })).toBeInTheDocument();
  });

  it("gives the poster an explanation and no button they cannot use", () => {
    render(<CoinpayReconnectNotice state="needs_reconnect" canFix={false} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByTestId("coinpay-reconnect-notice")).toHaveTextContent(/worker/i);
  });
});

describe("reconnectStateFrom", () => {
  it("reads a 409 coinpay_reconnect_required body", () => {
    expect(
      reconnectStateFrom({
        error: "x",
        code: "coinpay_reconnect_required",
        coinpay_link_state: "needs_reconnect",
        reconnect_url: "/settings/connections",
        oauth_required: true,
      })
    ).toEqual({ state: "needs_reconnect", canFix: true, url: "/settings/connections" });
  });

  it("ignores any other error", () => {
    expect(reconnectStateFrom({ error: "Invoice total exceeds the agreed amount" })).toBeNull();
    expect(reconnectStateFrom(null)).toBeNull();
  });
});
