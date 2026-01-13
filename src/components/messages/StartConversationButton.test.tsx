import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StartConversationButton } from "./StartConversationButton";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe("StartConversationButton", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockPush.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockClear();
  });

  it("renders with default text", () => {
    render(
      <StartConversationButton gigId="gig-123" recipientId="user-456" />
    );
    expect(screen.getByRole("button")).toHaveTextContent("Message");
  });

  it("creates conversation and navigates on click", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { id: "conv-789" } }),
    });

    render(
      <StartConversationButton gigId="gig-123" recipientId="user-456" />
    );

    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gig_id: "gig-123",
          recipient_id: "user-456",
        }),
      });
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard/messages/conv-789");
    });
  });

  it("shows loading state while creating conversation", async () => {
    let resolvePromise: () => void;
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePromise = () =>
            resolve({
              ok: true,
              json: () => Promise.resolve({ data: { id: "conv-789" } }),
            });
        })
    );

    const user = userEvent.setup();
    render(
      <StartConversationButton gigId="gig-123" recipientId="user-456" />
    );

    await user.click(screen.getByRole("button"));

    // Button should be disabled during loading
    expect(screen.getByRole("button")).toBeDisabled();

    // Resolve the fetch
    resolvePromise!();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });
  });

  it("handles API error gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Failed to create conversation" }),
    });

    render(
      <StartConversationButton gigId="gig-123" recipientId="user-456" />
    );

    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to create conversation:",
        "Failed to create conversation"
      );
    });

    // Should not navigate
    expect(mockPush).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("handles network error gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();

    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    render(
      <StartConversationButton gigId="gig-123" recipientId="user-456" />
    );

    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });

    expect(mockPush).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("accepts different variants", () => {
    const { rerender } = render(
      <StartConversationButton
        gigId="gig-123"
        recipientId="user-456"
        variant="default"
      />
    );
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(
      <StartConversationButton
        gigId="gig-123"
        recipientId="user-456"
        variant="ghost"
      />
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("accepts different sizes", () => {
    const { rerender } = render(
      <StartConversationButton
        gigId="gig-123"
        recipientId="user-456"
        size="sm"
      />
    );
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(
      <StartConversationButton
        gigId="gig-123"
        recipientId="user-456"
        size="lg"
      />
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("accepts custom className", () => {
    render(
      <StartConversationButton
        gigId="gig-123"
        recipientId="user-456"
        className="custom-class"
      />
    );
    expect(screen.getByRole("button")).toHaveClass("custom-class");
  });

  it("re-enables button after request completes", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Error" }),
    });

    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <StartConversationButton gigId="gig-123" recipientId="user-456" />
    );

    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByRole("button")).not.toBeDisabled();
    });
  });
});
