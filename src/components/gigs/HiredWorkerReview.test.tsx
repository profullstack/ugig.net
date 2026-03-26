import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HiredWorkerReview } from "./HiredWorkerReview";

vi.mock("@/components/testimonials/StarRating", () => ({
  StarRating: ({ rating, onRatingChange, interactive }: any) => (
    <div data-testid="star-rating" data-rating={rating}>
      {interactive && (
        <button onClick={() => onRatingChange(5)} data-testid="set-rating">
          Set 5 stars
        </button>
      )}
    </div>
  ),
}));

const mockWorkers = [
  {
    id: "worker-1",
    username: "janedoe",
    full_name: "Jane Doe",
    avatar_url: null,
    application_status: "accepted",
  },
  {
    id: "worker-2",
    username: "bobdev",
    full_name: null,
    avatar_url: "https://example.com/bob.jpg",
    application_status: "completed",
  },
];

describe("HiredWorkerReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders nothing when no workers", () => {
    const { container } = render(
      <HiredWorkerReview
        gigId="gig-1"
        workers={[]}
        currentUserId="poster-1"
        existingReviews={new Set()}
      />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders hired workers list", () => {
    render(
      <HiredWorkerReview
        gigId="gig-1"
        workers={mockWorkers}
        currentUserId="poster-1"
        existingReviews={new Set()}
      />
    );

    expect(screen.getByText("Hired Workers")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("bobdev")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("shows Leave Review button for each worker", () => {
    render(
      <HiredWorkerReview
        gigId="gig-1"
        workers={mockWorkers}
        currentUserId="poster-1"
        existingReviews={new Set()}
      />
    );

    expect(screen.getAllByText("Leave Review")).toHaveLength(2);
  });

  it("shows Review submitted for already reviewed workers", () => {
    render(
      <HiredWorkerReview
        gigId="gig-1"
        workers={mockWorkers}
        currentUserId="poster-1"
        existingReviews={new Set(["worker-1"])}
      />
    );

    expect(screen.getByText("Review submitted")).toBeInTheDocument();
    expect(screen.getAllByText("Leave Review")).toHaveLength(1);
  });

  it("expands review form when clicking Leave Review", () => {
    render(
      <HiredWorkerReview
        gigId="gig-1"
        workers={[mockWorkers[0]]}
        currentUserId="poster-1"
        existingReviews={new Set()}
      />
    );

    fireEvent.click(screen.getByText("Leave Review"));

    expect(screen.getByPlaceholderText(/How was your experience working with Jane Doe/)).toBeInTheDocument();
    expect(screen.getByText("Submit Review")).toBeInTheDocument();
  });

  it("submits review successfully", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { id: "t-1" } }),
    });

    render(
      <HiredWorkerReview
        gigId="gig-1"
        workers={[mockWorkers[0]]}
        currentUserId="poster-1"
        existingReviews={new Set()}
      />
    );

    fireEvent.click(screen.getByText("Leave Review"));
    fireEvent.click(screen.getByTestId("set-rating"));
    fireEvent.change(screen.getByPlaceholderText(/How was your experience/), {
      target: { value: "Excellent developer!" },
    });
    fireEvent.click(screen.getByText("Submit Review"));

    await waitFor(() => {
      expect(screen.getByText("Review submitted")).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/testimonials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile_id: "worker-1",
        gig_id: "gig-1",
        rating: 5,
        content: "Excellent developer!",
      }),
    });
  });

  it("shows error on failed submission", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Rate limit exceeded" }),
    });

    render(
      <HiredWorkerReview
        gigId="gig-1"
        workers={[mockWorkers[0]]}
        currentUserId="poster-1"
        existingReviews={new Set()}
      />
    );

    fireEvent.click(screen.getByText("Leave Review"));
    fireEvent.click(screen.getByTestId("set-rating"));
    fireEvent.change(screen.getByPlaceholderText(/How was your experience/), {
      target: { value: "Good work" },
    });
    fireEvent.click(screen.getByText("Submit Review"));

    await waitFor(() => {
      expect(screen.getByText("Rate limit exceeded")).toBeInTheDocument();
    });
  });

  it("collapses form on Cancel", () => {
    render(
      <HiredWorkerReview
        gigId="gig-1"
        workers={[mockWorkers[0]]}
        currentUserId="poster-1"
        existingReviews={new Set()}
      />
    );

    fireEvent.click(screen.getByText("Leave Review"));
    expect(screen.getByText("Cancel")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
    expect(screen.getByText("Leave Review")).toBeInTheDocument();
  });
});
