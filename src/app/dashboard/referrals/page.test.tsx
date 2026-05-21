import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReferralsPage from "./page";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockInitialLoads() {
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ link: "https://ugig.net/invite/alice", code: "alice" }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [],
          stats: { total_invited: 0, total_registered: 0, conversion_rate: 0 },
        }),
    });
}

describe("ReferralsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInitialLoads();
  });

  it("recovers when sending referral invites fails at the network layer", async () => {
    const user = userEvent.setup();
    mockFetch.mockRejectedValueOnce(new Error("network unavailable"));

    render(<ReferralsPage />);

    await user.type(
      screen.getByPlaceholderText("Enter email addresses separated by commas or new lines"),
      "friend@example.com"
    );
    await user.click(screen.getByRole("button", { name: /send invites/i }));

    await waitFor(() => {
      expect(screen.getByText("Failed to send invites")).toBeInTheDocument();
    });

    const button = screen.getByRole("button", { name: /send invites/i });
    expect(button).toBeEnabled();
    expect(screen.queryByRole("button", { name: /sending/i })).not.toBeInTheDocument();
  });

  it("recovers when the invite API returns a non-JSON error response", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.reject(new Error("not json")),
    });

    render(<ReferralsPage />);

    await user.type(
      screen.getByPlaceholderText("Enter email addresses separated by commas or new lines"),
      "friend@example.com"
    );
    await user.click(screen.getByRole("button", { name: /send invites/i }));

    await waitFor(() => {
      expect(screen.getByText("Failed to send invites")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /send invites/i })).toBeEnabled();
  });
});
