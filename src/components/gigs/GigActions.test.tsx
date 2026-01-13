import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GigActions } from "./GigActions";

// Mock next/navigation
const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

// Mock the API
vi.mock("@/lib/api", () => ({
  gigs: {
    updateStatus: vi.fn(),
    delete: vi.fn(),
  },
}));

import { gigs as gigsApi } from "@/lib/api";

describe("GigActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders edit button", () => {
    render(<GigActions gigId="gig-123" status="active" />);
    const editLink = screen.getByRole("link");
    expect(editLink).toHaveAttribute("href", "/gigs/gig-123/edit");
  });

  it("renders more options button", () => {
    render(<GigActions gigId="gig-123" status="active" />);
    const buttons = screen.getAllByRole("button");
    // Should have Edit button and More options button
    expect(buttons.length).toBe(2);
  });

  it("shows pause option for active gigs", async () => {
    render(<GigActions gigId="gig-123" status="active" />);

    // Click the more options button (second button, after Edit)
    const buttons = screen.getAllByRole("button");
    const moreButton = buttons[1];
    fireEvent.click(moreButton);

    expect(screen.getByText("Pause Gig")).toBeInTheDocument();
  });

  it("shows activate option for paused gigs", async () => {
    render(<GigActions gigId="gig-123" status="paused" />);

    const buttons = screen.getAllByRole("button");
    const moreButton = buttons[1];
    fireEvent.click(moreButton);

    expect(screen.getByText("Activate Gig")).toBeInTheDocument();
  });

  it("shows publish option for draft gigs", async () => {
    render(<GigActions gigId="gig-123" status="draft" />);

    const buttons = screen.getAllByRole("button");
    const moreButton = buttons[1];
    fireEvent.click(moreButton);

    expect(screen.getByText("Publish Gig")).toBeInTheDocument();
  });

  it("shows close and fill options for active gigs", async () => {
    render(<GigActions gigId="gig-123" status="active" />);

    const buttons = screen.getAllByRole("button");
    const moreButton = buttons[1];
    fireEvent.click(moreButton);

    expect(screen.getByText("Mark as Filled")).toBeInTheDocument();
    expect(screen.getByText("Close Gig")).toBeInTheDocument();
  });

  it("always shows delete option", async () => {
    render(<GigActions gigId="gig-123" status="active" />);

    const buttons = screen.getAllByRole("button");
    const moreButton = buttons[1];
    fireEvent.click(moreButton);

    expect(screen.getByText("Delete Gig")).toBeInTheDocument();
  });

  it("calls updateStatus API when pausing gig", async () => {
    vi.mocked(gigsApi.updateStatus).mockResolvedValue({ data: {}, error: null });

    render(<GigActions gigId="gig-123" status="active" />);

    const buttons = screen.getAllByRole("button");
    const moreButton = buttons[1];
    fireEvent.click(moreButton);

    const pauseButton = screen.getByText("Pause Gig");
    fireEvent.click(pauseButton);

    await waitFor(() => {
      expect(gigsApi.updateStatus).toHaveBeenCalledWith("gig-123", "paused");
    });
  });

  it("calls delete API when deleting gig", async () => {
    vi.mocked(gigsApi.delete).mockResolvedValue({ data: {}, error: null });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<GigActions gigId="gig-123" status="active" />);

    const buttons = screen.getAllByRole("button");
    const moreButton = buttons[1];
    fireEvent.click(moreButton);

    const deleteButton = screen.getByText("Delete Gig");
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(gigsApi.delete).toHaveBeenCalledWith("gig-123");
    });
  });

  it("shows confirmation dialog before deleting", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<GigActions gigId="gig-123" status="active" />);

    const buttons = screen.getAllByRole("button");
    const moreButton = buttons[1];
    fireEvent.click(moreButton);

    const deleteButton = screen.getByText("Delete Gig");
    fireEvent.click(deleteButton);

    expect(confirmSpy).toHaveBeenCalled();
    expect(gigsApi.delete).not.toHaveBeenCalled();
  });

  it("refreshes router after successful status update", async () => {
    vi.mocked(gigsApi.updateStatus).mockResolvedValue({ data: {}, error: null });

    render(<GigActions gigId="gig-123" status="active" />);

    const buttons = screen.getAllByRole("button");
    const moreButton = buttons[1];
    fireEvent.click(moreButton);

    const pauseButton = screen.getByText("Pause Gig");
    fireEvent.click(pauseButton);

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it("displays error message on API failure", async () => {
    vi.mocked(gigsApi.updateStatus).mockResolvedValue({
      data: null,
      error: "Failed to update status",
    });

    render(<GigActions gigId="gig-123" status="active" />);

    const buttons = screen.getAllByRole("button");
    const moreButton = buttons[1];
    fireEvent.click(moreButton);

    const pauseButton = screen.getByText("Pause Gig");
    fireEvent.click(pauseButton);

    await waitFor(() => {
      expect(screen.getByText("Failed to update status")).toBeInTheDocument();
    });
  });
});
