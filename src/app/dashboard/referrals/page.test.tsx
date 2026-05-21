import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReferralsPage from "./page";

const mockFetch = vi.fn();
global.fetch = mockFetch;
const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const originalExecCommand = document.execCommand;

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

function mockClipboard(writeText?: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
}

function mockExecCommand(copyResult: boolean) {
  document.execCommand = vi.fn(() => copyResult);
}

describe("ReferralsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInitialLoads();
    mockClipboard(vi.fn().mockResolvedValue(undefined));
    mockExecCommand(true);
  });

  afterEach(() => {
    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
    }
    document.execCommand = originalExecCommand;
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

  it("falls back to a textarea copy when Clipboard API writes are blocked", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    mockClipboard(writeText);
    mockExecCommand(true);

    render(<ReferralsPage />);

    await screen.findByDisplayValue("https://ugig.net/invite/alice");
    await user.click(screen.getByRole("button", { name: /copy/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /copied/i })).toBeInTheDocument();
    });

    expect(writeText).toHaveBeenCalledWith("https://ugig.net/invite/alice");
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(screen.queryByText(/copy failed/i)).not.toBeInTheDocument();
  });

  it("shows a manual-copy error when all copy paths fail", async () => {
    const user = userEvent.setup();
    mockClipboard(undefined);
    mockExecCommand(false);

    render(<ReferralsPage />);

    await screen.findByDisplayValue("https://ugig.net/invite/alice");
    await user.click(screen.getByRole("button", { name: /copy/i }));

    expect(
      await screen.findByText("Copy failed. Select the link and copy it manually.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
  });
});
