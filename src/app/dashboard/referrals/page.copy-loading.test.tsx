// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReferralsPage from "./page";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("ReferralsPage copy loading state", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("disables referral link copying until the link is loaded", async () => {
    const codeResponse = deferred<{
      ok: boolean;
      json: () => Promise<{ code: string; link: string }>;
    }>();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url === "/api/referrals/code") {
          return codeResponse.promise;
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

    render(<ReferralsPage />);

    const copyButton = screen.getByRole("button", { name: /copy/i });
    expect(copyButton).toBeDisabled();

    codeResponse.resolve({
      ok: true,
      json: async () => ({
        code: "alice",
        link: "https://ugig.net/?ref=alice",
      }),
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("https://ugig.net/?ref=alice")).toBeTruthy();
    });
    expect(copyButton).not.toBeDisabled();
  });
});
