import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockGet = vi.fn();
vi.mock("@/lib/api", () => ({
  subscriptions: {
    get: () => mockGet(),
    createPortalSession: vi.fn(),
    cancel: vi.fn(),
    reactivate: vi.fn(),
  },
}));
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));
vi.mock("@/components/providers/DialogProvider", () => ({
  useDialog: () => ({ confirm: vi.fn().mockResolvedValue(true) }),
}));

import SubscriptionPage from "./page";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("subscription page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows plans.ts prices, crypto only, no card checkout, and no removed perks", async () => {
    mockGet.mockResolvedValue({ data: { data: { plan: "free", status: "active", cancel_at_period_end: false } } });
    const { container } = render(<SubscriptionPage />);
    await screen.findByText(/\$90\/year with crypto/);
    const text = container.textContent || "";
    expect(text).toContain("$9/month with crypto (CoinPay)");
    expect(text).toContain("Crypto, via CoinPay");
    expect(text).not.toMatch(/stripe|by card|credit card/i);
    expect(text).toContain("Unlimited gig posts, forever");
    expect(text).not.toMatch(/priority support|featured listings|premium features/i);
  });

  it("starts an annual CoinPay checkout", async () => {
    mockGet.mockResolvedValue({ data: { data: { plan: "free", status: "active", cancel_at_period_end: false } } });
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: "nope" }) });
    render(<SubscriptionPage />);
    await userEvent.click(await screen.findByText(/\$90\/year with crypto/));
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/payments/coinpayportal/create");
    expect(JSON.parse(init.body)).toEqual({ type: "subscription", plan: "annual", currency: "usdc_pol" });
  });

  it("treats lifetime as paid and hides the downgrade button", async () => {
    mockGet.mockResolvedValue({ data: { data: { plan: "lifetime", status: "active", cancel_at_period_end: false } } });
    render(<SubscriptionPage />);
    await screen.findByText("You’re on the Lifetime plan");
    expect(screen.queryByText("Downgrade to Free")).toBeNull();
    expect(screen.queryByText(/with crypto \(CoinPay\)/)).toBeNull();
  });

  it("crypto (CoinPay) Pro shows its paid-through date and no Stripe buttons", async () => {
    mockGet.mockResolvedValue({
      data: { data: { plan: "pro", status: "active", cancel_at_period_end: false, current_period_end: "2027-01-01T12:00:00Z" } },
    });
    render(<SubscriptionPage />);
    await screen.findByText("You’re on the Pro plan");
    expect(screen.getByText(/Paid through/)).toBeTruthy();
    expect(screen.queryByText("Manage Billing")).toBeNull();
    expect(screen.queryByText("Downgrade to Free")).toBeNull();
    expect(screen.getByText(/Add a year with crypto \(\$90\)/)).toBeTruthy();
  });

  it("a legacy Stripe-billed Pro keeps Manage Billing and Downgrade", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          plan: "pro",
          status: "active",
          cancel_at_period_end: false,
          stripe_subscription_id: "sub_1",
          current_period_end: "2027-01-01T12:00:00Z",
        },
      },
    });
    render(<SubscriptionPage />);
    await screen.findByText("You’re on the Pro plan");
    expect(screen.getByText(/Renews/)).toBeTruthy();
    expect(screen.getAllByText("Manage Billing").length).toBeGreaterThan(0);
    expect(screen.getByText("Downgrade to Free")).toBeTruthy();
  });

  it("offers monthly Pro with crypto too", async () => {
    mockGet.mockResolvedValue({ data: { data: { plan: "free", status: "active", cancel_at_period_end: false } } });
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: "nope" }) });
    render(<SubscriptionPage />);
    await userEvent.click(await screen.findByText(/\$9\/month with crypto/));
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ type: "subscription", plan: "monthly", currency: "usdc_pol" });
  });

  it("shows a confirmation when CoinPay returns the buyer with ?payment=success", async () => {
    searchParams = new URLSearchParams("payment=success");
    mockGet.mockResolvedValue({ data: { data: { plan: "free", status: "active", cancel_at_period_end: false } } });
    render(<SubscriptionPage />);
    expect(await screen.findByText(/activates as soon as CoinPay confirms/)).toBeTruthy();
    searchParams = new URLSearchParams();
  });
});
