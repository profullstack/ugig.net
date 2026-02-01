import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FollowButton } from "./FollowButton";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("FollowButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Follow when not following", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ following: false }),
    });

    render(<FollowButton username="testuser" />);

    await waitFor(() => {
      expect(screen.getByText("Follow")).toBeInTheDocument();
    });
  });

  it("renders Unfollow when already following", async () => {
    render(<FollowButton username="testuser" initialFollowing={true} />);

    expect(screen.getByText("Unfollow")).toBeInTheDocument();
  });

  it("toggles follow state on click", async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ following: false }),
    });

    render(<FollowButton username="testuser" initialFollowing={false} />);

    // Click follow
    mockFetch.mockResolvedValueOnce({ ok: true });

    const button = screen.getByText("Follow");
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("Unfollow")).toBeInTheDocument();
    });

    // Verify the POST call
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/users/testuser/follow",
      { method: "POST" }
    );
  });

  it("toggles unfollow state on click", async () => {
    const user = userEvent.setup();

    render(<FollowButton username="testuser" initialFollowing={true} />);

    mockFetch.mockResolvedValueOnce({ ok: true });

    const button = screen.getByText("Unfollow");
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("Follow")).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/users/testuser/follow",
      { method: "DELETE" }
    );
  });

  it("uses initialFollowing prop without fetching", () => {
    render(<FollowButton username="testuser" initialFollowing={false} />);

    expect(screen.getByText("Follow")).toBeInTheDocument();
    // Should not have fetched since initialFollowing was provided
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
