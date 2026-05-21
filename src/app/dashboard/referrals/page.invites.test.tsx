// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReferralsPage from "./page";

function mockFetchForInviteFailure(failure: "network" | "invalid-json") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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

      if (url === "/api/referrals" && init?.method === "POST") {
        if (failure === "network") {
          throw new Error("connection reset");
        }

        return {
          ok: false,
          json: async () => {
            throw new Error("invalid json");
          },
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

async function submitInvite() {
  render(<ReferralsPage />);

  const textarea = await screen.findByPlaceholderText(
    "Enter email addresses separated by commas or new lines"
  );
  await act(async () => {
    fireEvent.change(textarea, { target: { value: "friend@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send invites/i }));
  });
}

describe("ReferralsPage invite error recovery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("recovers from invite network errors", async () => {
    mockFetchForInviteFailure("network");

    await submitInvite();

    await waitFor(() => {
      expect(screen.getByText("Failed to send invites. Please try again.")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: /send invites/i })).not.toBeDisabled();
  });

  it("recovers from non-json invite error responses", async () => {
    mockFetchForInviteFailure("invalid-json");

    await submitInvite();

    await waitFor(() => {
      expect(screen.getByText("Failed to send invites")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: /send invites/i })).not.toBeDisabled();
  });
});
