import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SatsToUsd, SatsRangeToUsd } from "./SatsToUsd";

describe("SatsToUsd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ rate: 100000 }), // $100k per BTC
    });
  });

  it("renders USD equivalent for sats amount", async () => {
    render(<SatsToUsd sats={100000} />);

    await waitFor(() => {
      // 100,000 sats at $100k/BTC = $100
      expect(screen.getByText(/≈ \$100 USD/)).toBeInTheDocument();
    });
  });

  it("renders small amounts correctly", async () => {
    render(<SatsToUsd sats={500} />);

    await waitFor(() => {
      // 500 sats at $100k/BTC = $0.50
      expect(screen.getByText(/≈ \$0\.50 USD/)).toBeInTheDocument();
    });
  });

  it("renders nothing before rate loads", () => {
    global.fetch = vi.fn().mockImplementation(() => new Promise(() => {})); // never resolves
    const { container } = render(<SatsToUsd sats={100000} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("SatsRangeToUsd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ rate: 100000 }),
    });
  });

  it("renders range when both min and max provided", async () => {
    render(<SatsRangeToUsd min={50000} max={100000} />);

    await waitFor(() => {
      expect(screen.getByText(/≈ \$50 - \$100 USD/)).toBeInTheDocument();
    });
  });

  it("renders min-only with plus", async () => {
    render(<SatsRangeToUsd min={50000} max={null} />);

    await waitFor(() => {
      expect(screen.getByText(/≈ \$50\+ USD/)).toBeInTheDocument();
    });
  });

  it("renders max-only with 'up to'", async () => {
    render(<SatsRangeToUsd min={null} max={200000} />);

    await waitFor(() => {
      expect(screen.getByText(/≈ up to \$200 USD/)).toBeInTheDocument();
    });
  });

  it("renders nothing when both null", () => {
    const { container } = render(<SatsRangeToUsd min={null} max={null} />);
    // Should render nothing since no amounts
    expect(container.querySelector("span")?.textContent || "").toBe("");
  });
});
