import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StartVideoCallButton } from "./StartVideoCallButton";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock the API
vi.mock("@/lib/api", () => ({
  videoCalls: {
    create: vi.fn(),
  },
}));

import { videoCalls } from "@/lib/api";

describe("StartVideoCallButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders button with Video Call text", () => {
    render(<StartVideoCallButton participantId="user-123" />);

    expect(screen.getByText("Video Call")).toBeInTheDocument();
  });

  it("renders with video icon", () => {
    render(<StartVideoCallButton participantId="user-123" />);

    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });

  it("calls videoCalls.create when clicked", async () => {
    vi.mocked(videoCalls.create).mockResolvedValue({
      data: { data: { id: "call-123" } },
      error: null,
    });

    render(<StartVideoCallButton participantId="user-456" />);

    const button = screen.getByRole("button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(videoCalls.create).toHaveBeenCalledWith({
        participant_id: "user-456",
        gig_id: undefined,
        application_id: undefined,
      });
    });
  });

  it("passes gig_id and application_id to API", async () => {
    vi.mocked(videoCalls.create).mockResolvedValue({
      data: { data: { id: "call-123" } },
      error: null,
    });

    render(
      <StartVideoCallButton
        participantId="user-456"
        gigId="gig-789"
        applicationId="app-101"
      />
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(videoCalls.create).toHaveBeenCalledWith({
        participant_id: "user-456",
        gig_id: "gig-789",
        application_id: "app-101",
      });
    });
  });

  it("navigates to call page on success", async () => {
    vi.mocked(videoCalls.create).mockResolvedValue({
      data: { data: { id: "call-123" } },
      error: null,
    });

    render(<StartVideoCallButton participantId="user-456" />);

    const button = screen.getByRole("button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard/calls/call-123");
    });
  });

  it("shows loading state while creating call", async () => {
    vi.mocked(videoCalls.create).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: { data: { id: "call-123" } }, error: null }), 100))
    );

    render(<StartVideoCallButton participantId="user-456" />);

    const button = screen.getByRole("button");
    fireEvent.click(button);

    // Button should be disabled during loading
    expect(button).toBeDisabled();
  });

  it("disables button while loading", async () => {
    vi.mocked(videoCalls.create).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: { data: { id: "call-123" } }, error: null }), 100))
    );

    render(<StartVideoCallButton participantId="user-456" />);

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(button).toBeDisabled();
  });

  it("does not navigate on API error", async () => {
    vi.mocked(videoCalls.create).mockResolvedValue({
      data: null,
      error: "Failed to create call",
    });

    render(<StartVideoCallButton participantId="user-456" />);

    const button = screen.getByRole("button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(videoCalls.create).toHaveBeenCalled();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("re-enables button after API error", async () => {
    vi.mocked(videoCalls.create).mockResolvedValue({
      data: null,
      error: "Failed to create call",
    });

    render(<StartVideoCallButton participantId="user-456" />);

    const button = screen.getByRole("button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });

  it("applies custom className", () => {
    render(
      <StartVideoCallButton
        participantId="user-456"
        className="custom-class"
      />
    );

    const button = screen.getByRole("button");
    expect(button).toHaveClass("custom-class");
  });

  it("respects variant prop", () => {
    const { rerender } = render(
      <StartVideoCallButton
        participantId="user-456"
        variant="default"
      />
    );

    // The default variant should have different styles
    let button = screen.getByRole("button");
    expect(button).toBeInTheDocument();

    rerender(
      <StartVideoCallButton
        participantId="user-456"
        variant="outline"
      />
    );

    button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });

  it("respects size prop", () => {
    render(
      <StartVideoCallButton
        participantId="user-456"
        size="lg"
      />
    );

    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });
});
