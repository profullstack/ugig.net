import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ZapsPage from "./page";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function jsonResponse(data: unknown) {
  return {
    json: () => Promise.resolve(data),
  };
}

function zapEntry(overrides = {}) {
  return {
    id: "zap-1",
    amount_sats: 2500,
    fee_sats: 0,
    target_type: "post",
    target_id: "post-1",
    note: null,
    created_at: new Date().toISOString(),
    user: {
      id: "user-1",
      username: "alice",
      name: "Alice",
      avatar_url: null,
    },
    ...overrides,
  };
}

describe("ZapsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("clears stale received zaps immediately when switching to sent history", async () => {
    const user = userEvent.setup();
    let resolveSentHistory: (value: ReturnType<typeof jsonResponse>) => void = () => {};

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ zaps: [zapEntry()], total: 1 }))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSentHistory = resolve;
        })
      );

    render(<ZapsPage />);

    expect(await screen.findByText("Alice")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /sent/i }));

    await waitFor(() => {
      expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    });
    expect(mockFetch).toHaveBeenLastCalledWith(
      "/api/zaps/history?direction=sent&limit=25&offset=0"
    );

    resolveSentHistory(jsonResponse({ zaps: [], total: 0 }));
    expect(await screen.findByText(/You haven't zapped anyone yet/)).toBeInTheDocument();
  });
});
