import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OfferDetailClient from "./OfferDetailClient";

const mockPush = vi.fn();
const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "offer-slug" }),
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("@/components/ui/MarkdownContent", () => ({
  MarkdownContent: ({ content }: { content: string }) => <div>{content}</div>,
}));

const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const originalExecCommand = document.execCommand;

const offer = {
  id: "offer-1",
  slug: "offer-slug",
  title: "AI Prompt Pack",
  description: "Useful prompts",
  product_type: "skill",
  product_url: "https://example.com/product",
  price_sats: 5000,
  commission_rate: 0.2,
  commission_type: "percentage",
  commission_flat_sats: 0,
  cookie_days: 30,
  settlement_delay_days: 7,
  promo_text: null,
  total_affiliates: 2,
  total_conversions: 3,
  total_revenue_sats: 15000,
  category: "ai",
  tags: ["prompts"],
  created_at: "2026-05-21T00:00:00Z",
  seller_id: "seller-1",
  profiles: { username: "seller", avatar_url: null },
  skill_listings: null,
};

function mockClipboard(writeText?: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
}

function mockExecCommand(copyResult: boolean) {
  document.execCommand = vi.fn(() => copyResult);
}

function mockApi() {
  mockFetch.mockImplementation((input: RequestInfo | URL) => {
    const url = input.toString();

    if (url === "/api/rates/btc") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ rate: 100000 }),
      });
    }

    if (url === "/api/auth/session") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ user: { id: "buyer-1" } }),
      });
    }

    if (url.startsWith("/api/affiliates/offers?")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ offers: [{ id: "offer-1" }] }),
      });
    }

    if (url === "/api/affiliates/offers/offer-1") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ offer }),
      });
    }

    if (url === "/api/affiliates/offers/offer-1/apply") {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            tracking_url: "https://ugig.net/ref/track-123",
          }),
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  });
}

async function applyForOffer(user: ReturnType<typeof userEvent.setup>) {
  render(<OfferDetailClient />);

  await user.click(await screen.findByRole("button", { name: /become an affiliate/i }));
  await screen.findByDisplayValue("https://ugig.net/ref/track-123");

  return user;
}

describe("OfferDetailClient tracking link copy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
    mockClipboard(vi.fn().mockResolvedValue(undefined));
    mockExecCommand(true);
  });

  afterEach(() => {
    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
    }
    document.execCommand = originalExecCommand;
  });

  it("falls back to a textarea copy when Clipboard API writes are blocked", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    mockClipboard(writeText);
    mockExecCommand(true);

    await applyForOffer(user);

    await user.click(screen.getByRole("button", { name: /copy/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /copied/i })).toBeInTheDocument();
    });

    expect(writeText).toHaveBeenCalledWith("https://ugig.net/ref/track-123");
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(screen.queryByText(/copy failed/i)).not.toBeInTheDocument();
  });

  it("shows a manual-copy error when all tracking-link copy paths fail", async () => {
    const user = userEvent.setup();
    mockClipboard(undefined);
    mockExecCommand(false);

    await applyForOffer(user);

    await user.click(screen.getByRole("button", { name: /copy/i }));

    expect(
      await screen.findByText("Copy failed. Select the tracking link and copy it manually.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
  });
});
