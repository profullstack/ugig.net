import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReferralsPage from "./page";

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock clipboard
const mockWriteText = vi.fn(() => Promise.resolve());
Object.assign(navigator, {
  clipboard: { writeText: mockWriteText },
});

function mockCodeResponse(link = "", code = "") {
  return {
    ok: true,
    json: () => Promise.resolve({ link, code }),
  };
}

function mockReferralsResponse() {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        data: [],
        stats: { total_invited: 0, total_registered: 0, conversion_rate: 0 },
      }),
  };
}

describe("ReferralsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state on Copy button while referral link is loading", async () => {
    // Make the code fetch never resolve to simulate loading
    let resolveCode: (v: unknown) => void;
    const codePromise = new Promise((r) => {
      resolveCode = r;
    });
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/referrals/code")) return codePromise;
      return Promise.resolve(mockReferralsResponse());
    });

    render(<ReferralsPage />);

    // While loading, the button should say "Loading..." and be disabled
    const loadingButton = screen.getByRole("button", { name: /loading/i });
    expect(loadingButton).toBeDisabled();

    // Now resolve the code fetch with a link
    resolveCode!(mockCodeResponse("https://example.com/ref/abc123", "abc123"));

    // After loading, button should show "Copy" and be enabled
    await waitFor(() => {
      const copyButton = screen.getByRole("button", { name: /copy/i });
      expect(copyButton).not.toBeDisabled();
    });
  });

  it("disables Copy button when referral link is empty after loading", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/referrals/code"))
        return Promise.resolve(mockCodeResponse("", ""));
      return Promise.resolve(mockReferralsResponse());
    });

    render(<ReferralsPage />);

    // After loading completes with empty link, Copy should still be disabled
    await waitFor(() => {
      const copyButton = screen.getByRole("button", { name: /copy/i });
      expect(copyButton).toBeDisabled();
    });
  });

  it("copies referral link successfully after link loads", async () => {
    const testLink = "https://example.com/ref/testcode";
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/referrals/code"))
        return Promise.resolve(mockCodeResponse(testLink, "testcode"));
      return Promise.resolve(mockReferralsResponse());
    });

    render(<ReferralsPage />);

    // Wait for Copy button to become enabled
    const copyButton = await screen.findByRole("button", { name: /copy/i });
    expect(copyButton).not.toBeDisabled();

    await userEvent.click(copyButton);

    expect(mockWriteText).toHaveBeenCalledWith(testLink);
  });
});
