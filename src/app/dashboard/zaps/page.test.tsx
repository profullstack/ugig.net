import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
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

function deferredResponse() {
  let resolveResponse: (value: ReturnType<typeof jsonResponse>) => void = () => {};
  const promise = new Promise<ReturnType<typeof jsonResponse>>((resolve) => {
    resolveResponse = resolve;
  });
  return { promise, resolveResponse };
}

describe("ZapsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("clears stale received zaps immediately when switching to sent history", async () => {
    const user = userEvent.setup();
    const sentHistory = deferredResponse();

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ zaps: [zapEntry()], total: 1 }))
      .mockReturnValueOnce(sentHistory.promise);

    render(<ZapsPage />);

    expect(await screen.findByText("Alice")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /sent/i }));

    await waitFor(() => {
      expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    });
    expect(mockFetch).toHaveBeenLastCalledWith(
      "/api/zaps/history?direction=sent&limit=25&offset=0"
    );

    await act(async () => {
      sentHistory.resolveResponse(jsonResponse({ zaps: [], total: 0 }));
    });
    expect(await screen.findByText(/You haven't zapped anyone yet/)).toBeInTheDocument();
  });

  it("ignores a received-history response that resolves after switching to sent", async () => {
    const user = userEvent.setup();
    const receivedHistory = deferredResponse();
    const sentHistory = deferredResponse();

    mockFetch
      .mockReturnValueOnce(receivedHistory.promise)
      .mockReturnValueOnce(sentHistory.promise);

    render(<ZapsPage />);

    await user.click(screen.getByRole("button", { name: /sent/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenLastCalledWith(
        "/api/zaps/history?direction=sent&limit=25&offset=0"
      );
    });

    await act(async () => {
      sentHistory.resolveResponse(
        jsonResponse({
          zaps: [
            zapEntry({
              id: "zap-2",
              amount_sats: 5000,
              user: {
                id: "user-2",
                username: "bob",
                name: "Bob",
                avatar_url: null,
              },
            }),
          ],
          total: 1,
        })
      );
    });

    expect(await screen.findByText("Bob")).toBeInTheDocument();

    await act(async () => {
      receivedHistory.resolveResponse(jsonResponse({ zaps: [zapEntry()], total: 1 }));
    });

    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });
});
