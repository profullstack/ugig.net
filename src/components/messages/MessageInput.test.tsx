import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageInput } from "./MessageInput";

describe("MessageInput", () => {
  const mockOnSend = vi.fn();

  beforeEach(() => {
    mockOnSend.mockClear();
    mockOnSend.mockResolvedValue(undefined);
  });

  it("renders textarea and send button", () => {
    render(<MessageInput onSend={mockOnSend} />);
    expect(screen.getByPlaceholderText("Type a message...")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("calls onSend when send button is clicked", async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "Hello world!");
    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith("Hello world!");
    });
  });

  it("clears input after successful send", async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText(
      "Type a message..."
    ) as HTMLTextAreaElement;
    await user.type(textarea, "Hello!");
    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(textarea.value).toBe("");
    });
  });

  it("disables send button when input is empty", () => {
    render(<MessageInput onSend={mockOnSend} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("enables send button when input has content", async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "Hello");

    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("trims whitespace before sending", async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "  Hello world!  ");
    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith("Hello world!");
    });
  });

  it("does not send whitespace-only messages", async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "   ");
    await user.click(screen.getByRole("button"));

    expect(mockOnSend).not.toHaveBeenCalled();
  });

  it("disables input when disabled prop is true", () => {
    render(<MessageInput onSend={mockOnSend} disabled={true} />);

    expect(screen.getByPlaceholderText("Type a message...")).toBeDisabled();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("uses custom placeholder when provided", () => {
    render(
      <MessageInput onSend={mockOnSend} placeholder="Custom placeholder..." />
    );
    expect(
      screen.getByPlaceholderText("Custom placeholder...")
    ).toBeInTheDocument();
  });

  it("sends on Ctrl+Enter", async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "Hello!");

    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith("Hello!");
    });
  });

  it("sends on Meta+Enter (Cmd+Enter)", async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "Hello!");

    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith("Hello!");
    });
  });

  it("does not send on regular Enter", async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "Hello!");

    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(mockOnSend).not.toHaveBeenCalled();
  });

  it("shows loading state while sending", async () => {
    // Create a promise we can control
    let resolvePromise: () => void;
    const slowOnSend = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePromise = resolve;
        })
    );

    const user = userEvent.setup();
    render(<MessageInput onSend={slowOnSend} />);

    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "Hello!");

    // Click the button to trigger send
    await user.click(screen.getByRole("button"));

    // Wait for the loading state - check for Loader2 icon (has animate-spin class)
    await waitFor(() => {
      expect(screen.getByRole("button")).toBeDisabled();
      // The loading spinner should be visible
      expect(document.querySelector(".animate-spin")).toBeInTheDocument();
    });

    // Resolve the promise
    resolvePromise!();

    // After successful send, input is cleared, so button stays disabled (no content)
    // But loading spinner should be gone
    await waitFor(() => {
      expect(document.querySelector(".animate-spin")).not.toBeInTheDocument();
    });
  });
});
