import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PollDisplay } from "./PollDisplay";

const initialResults = {
  options: [
    { id: "option-1", text: "First", votes: 1, percentage: 100 },
    { id: "option-2", text: "Second", votes: 0, percentage: 0 },
  ],
  total_votes: 1,
  user_vote: "option-1",
};

const changedResults = {
  options: [
    { id: "option-1", text: "First", votes: 0, percentage: 0 },
    { id: "option-2", text: "Second", votes: 1, percentage: 100 },
  ],
  total_votes: 1,
  user_vote: "option-2",
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("PollDisplay", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("lets an authenticated viewer change an existing vote", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(initialResults))
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(jsonResponse(changedResults));

    render(<PollDisplay postId="post-1" isLoggedIn />);
    await userEvent.click(await screen.findByRole("radio", { name: /Second/ }));

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/posts/post-1/poll/vote",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ option_id: "option-2" }),
      })
    );
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: /Second/ })).toHaveAttribute(
        "aria-checked",
        "true"
      );
    });
  });

  it("does not submit the already-selected option again", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(initialResults));

    render(<PollDisplay postId="post-1" isLoggedIn />);
    await userEvent.click(await screen.findByRole("radio", { name: /First/ }));

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
