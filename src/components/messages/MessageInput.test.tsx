import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageInput, MAX_FILE_SIZE, MAX_FILES } from "./MessageInput";

// Mock crypto.randomUUID with incrementing ids
let uuidCounter = 0;
vi.stubGlobal("crypto", {
  ...crypto,
  randomUUID: () => `test-uuid-${++uuidCounter}`,
});

describe("MessageInput", () => {
  const mockOnSend = vi.fn();

  beforeEach(() => {
    mockOnSend.mockClear();
    mockOnSend.mockResolvedValue(undefined);
  });

  it("renders textarea, send button, and attach button", () => {
    render(<MessageInput onSend={mockOnSend} />);
    expect(screen.getByPlaceholderText("Type a message...")).toBeInTheDocument();
    expect(screen.getByLabelText("Attach files")).toBeInTheDocument();
    // Send button + Attach button
    expect(screen.getAllByRole("button")).toHaveLength(3) // attach, emoji, send;
  });

  it("calls onSend when send button is clicked", async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "Hello world!");
    // Click the send button (not the attach button)
    const buttons = screen.getAllByRole("button");
    const sendButton = buttons[buttons.length - 1]; // Send is last
    await user.click(sendButton);

    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith("Hello world!", undefined);
    });
  });

  it("clears input after successful send", async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText(
      "Type a message..."
    ) as HTMLTextAreaElement;
    await user.type(textarea, "Hello!");
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(textarea.value).toBe("");
    });
  });

  it("disables send button when input is empty and no files", () => {
    render(<MessageInput onSend={mockOnSend} />);
    const buttons = screen.getAllByRole("button");
    const sendButton = buttons[buttons.length - 1];
    expect(sendButton).toBeDisabled();
  });

  it("enables send button when input has content", async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "Hello");

    const buttons = screen.getAllByRole("button");
    const sendButton = buttons[buttons.length - 1];
    expect(sendButton).not.toBeDisabled();
  });

  it("trims whitespace before sending", async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "  Hello world!  ");
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith("Hello world!", undefined);
    });
  });

  it("does not send whitespace-only messages without files", async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "   ");
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[buttons.length - 1]);

    expect(mockOnSend).not.toHaveBeenCalled();
  });

  it("disables input when disabled prop is true", () => {
    render(<MessageInput onSend={mockOnSend} disabled={true} />);

    expect(screen.getByPlaceholderText("Type a message...")).toBeDisabled();
    expect(screen.getByLabelText("Attach files")).toBeDisabled();
  });

  it("uses custom placeholder when provided", () => {
    render(
      <MessageInput onSend={mockOnSend} placeholder="Custom placeholder..." />
    );
    expect(
      screen.getByPlaceholderText("Custom placeholder...")
    ).toBeInTheDocument();
  });

  it("sends on Enter", async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "Hello!");

    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith("Hello!", undefined);
    });
  });

  it("does not send on Shift+Enter (allows newline)", async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "Hello!");

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    expect(mockOnSend).not.toHaveBeenCalled();
  });

  it("shows loading state while sending", async () => {
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

    const buttons = screen.getAllByRole("button");
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(buttons[buttons.length - 1]).toBeDisabled();
      expect(document.querySelector(".animate-spin")).toBeInTheDocument();
    });

    resolvePromise!();

    await waitFor(() => {
      expect(document.querySelector(".animate-spin")).not.toBeInTheDocument();
    });
  });

  // ---- File attachment tests ----

  it("shows file chips when files are selected", async () => {
    render(<MessageInput onSend={mockOnSend} />);

    const fileInput = screen.getByTestId("file-input") as HTMLInputElement;
    const file = new File(["hello"], "test.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("test.pdf")).toBeInTheDocument();
    });
  });

  it("shows file size in chips", async () => {
    render(<MessageInput onSend={mockOnSend} />);

    const fileInput = screen.getByTestId("file-input") as HTMLInputElement;
    const content = "x".repeat(2048);
    const file = new File([content], "doc.txt", { type: "text/plain" });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("doc.txt")).toBeInTheDocument();
      expect(screen.getByText("2.0 KB")).toBeInTheDocument();
    });
  });

  it("allows removing a selected file", async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} />);

    const fileInput = screen.getByTestId("file-input") as HTMLInputElement;
    const file = new File(["hello"], "test.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("test.pdf")).toBeInTheDocument();
    });

    const removeBtn = screen.getByLabelText("Remove test.pdf");
    await user.click(removeBtn);

    expect(screen.queryByText("test.pdf")).not.toBeInTheDocument();
  });

  it("enables send button when files are selected even without text", async () => {
    render(<MessageInput onSend={mockOnSend} />);

    const fileInput = screen.getByTestId("file-input") as HTMLInputElement;
    const file = new File(["hello"], "test.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      const sendButton = buttons[buttons.length - 1];
      expect(sendButton).not.toBeDisabled();
    });
  });

  it("sends files along with text", async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText("Type a message...");
    await user.type(textarea, "Check this file");

    const fileInput = screen.getByTestId("file-input") as HTMLInputElement;
    const file = new File(["hello"], "test.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("test.pdf")).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole("button");
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith("Check this file", [file]);
    });
  });

  it("sends files without text", async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} />);

    const fileInput = screen.getByTestId("file-input") as HTMLInputElement;
    const file = new File(["hello"], "test.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("test.pdf")).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole("button");
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith("", [file]);
    });
  });

  it("clears files after successful send", async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} />);

    const fileInput = screen.getByTestId("file-input") as HTMLInputElement;
    const file = new File(["hello"], "test.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("test.pdf")).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole("button");
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(screen.queryByText("test.pdf")).not.toBeInTheDocument();
    });
  });

  it("shows error for files exceeding 500MB", async () => {
    render(<MessageInput onSend={mockOnSend} />);

    const fileInput = screen.getByTestId("file-input") as HTMLInputElement;
    // Create a file larger than 10MB
    const bigContent = new ArrayBuffer(MAX_FILE_SIZE + 1);
    const file = new File([bigContent], "huge.zip", {
      type: "application/zip",
    });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("huge.zip exceeds 500MB limit")).toBeInTheDocument();
    });

    // File should not be added
    expect(screen.queryByTestId("file-chips")).not.toBeInTheDocument();
  });

  it("limits to MAX_FILES files", async () => {
    render(<MessageInput onSend={mockOnSend} />);

    const fileInput = screen.getByTestId("file-input") as HTMLInputElement;
    const files = Array.from({ length: MAX_FILES + 1 }, (_, i) =>
      new File(["hello"], `file${i}.txt`, { type: "text/plain" })
    );

    fireEvent.change(fileInput, { target: { files } });

    await waitFor(() => {
      expect(
        screen.getByText(`Maximum ${MAX_FILES} files per message`)
      ).toBeInTheDocument();
    });

    // Only MAX_FILES should be added
    const chips = screen.getByTestId("file-chips");
    const fileNames = Array.from({ length: MAX_FILES }, (_, i) => `file${i}.txt`);
    for (const name of fileNames) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.queryByText(`file${MAX_FILES}.txt`)).not.toBeInTheDocument();
  });

  it("shows image thumbnails for image files", async () => {
    // Mock URL.createObjectURL
    const mockUrl = "blob:mock-url";
    vi.spyOn(URL, "createObjectURL").mockReturnValue(mockUrl);
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    render(<MessageInput onSend={mockOnSend} />);

    const fileInput = screen.getByTestId("file-input") as HTMLInputElement;
    const file = new File(["fake-image"], "photo.png", {
      type: "image/png",
    });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      const img = screen.getByAltText("photo.png");
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", mockUrl);
    });

    vi.restoreAllMocks();
  });

  it("disables attach button when MAX_FILES are selected", async () => {
    render(<MessageInput onSend={mockOnSend} />);

    const fileInput = screen.getByTestId("file-input") as HTMLInputElement;
    const files = Array.from({ length: MAX_FILES }, (_, i) =>
      new File(["hello"], `file${i}.txt`, { type: "text/plain" })
    );

    fireEvent.change(fileInput, { target: { files } });

    await waitFor(() => {
      expect(screen.getByLabelText("Attach files")).toBeDisabled();
    });
  });
});
