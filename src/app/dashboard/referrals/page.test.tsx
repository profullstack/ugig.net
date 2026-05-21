// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReferralsPage from "./page";

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const originalExecCommand = document.execCommand;

function mockInitialRequests() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === "/api/referrals/code") {
        return {
          ok: true,
          json: async () => ({
            code: "alice",
            link: "https://ugig.net/?ref=alice",
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          data: [],
          stats: {
            total_invited: 0,
            total_registered: 0,
            conversion_rate: 0,
          },
        }),
      };
    })
  );
}

describe("ReferralsPage", () => {
  beforeEach(() => {
    mockInitialRequests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();

    if (originalClipboard) {
      Object.defineProperty(navigator, "clipboard", originalClipboard);
    }
    document.execCommand = originalExecCommand;
  });

  it("falls back when clipboard write is rejected", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });
    document.execCommand = vi.fn(() => true);

    render(<ReferralsPage />);

    await waitFor(() => {
      expect((screen.getByDisplayValue("https://ugig.net/?ref=alice") as HTMLInputElement).value).toBe(
        "https://ugig.net/?ref=alice"
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /copied/i })).toBeTruthy();
    });
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("shows a manual-copy error when clipboard fallback fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    document.execCommand = vi.fn(() => false);

    render(<ReferralsPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("https://ugig.net/?ref=alice")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Unable to copy referral link. Please copy it manually.")
      ).toBeTruthy();
    });
  });
});
