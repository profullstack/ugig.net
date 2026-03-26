import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CompletedGigs } from "./CompletedGigs";

// Mock StarRating
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

const mockGigs = [
  {
    id: "app-1",
    gig_id: "gig-1",
    gig_title: "Build a Website",
    gig_budget_type: "fixed",
    gig_budget_min: 500,
    poster_username: "alice",
    poster_full_name: "Alice Smith",
    completed_at: "2026-03-15T00:00:00Z",
  },
  {
    id: "app-2",
    gig_id: "gig-2",
    gig_title: "Design a Logo",
    gig_budget_type: "fixed",
    gig_budget_min: 200,
    poster_username: "bob",
    poster_full_name: null,
    completed_at: "2026-03-10T00:00:00Z",
  },
];

describe("CompletedGigs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders nothing when no gigs", () => {
    const { container } = render(
      <CompletedGigs
        profileId="user-1"
        profileUsername="testuser"
        gigs={[]}
        currentUserId="viewer-1"
        isOwnProfile={false}
        existingTestimonialGigIds={new Set()}
      />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders completed gigs list", () => {
    render(
      <CompletedGigs
        profileId="user-1"
        profileUsername="testuser"
        gigs={mockGigs}
        currentUserId={null}
        isOwnProfile={false}
        existingTestimonialGigIds={new Set()}
      />
    );

    expect(screen.getByText("Completed Gigs")).toBeInTheDocument();
    expect(screen.getByText("(2)")).toBeInTheDocument();
    expect(screen.getByText("Build a Website")).toBeInTheDocument();
    expect(screen.getByText("Design a Logo")).toBeInTheDocument();
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("shows Leave Testimonial button for logged-in non-owners", () => {
    render(
      <CompletedGigs
        profileId="user-1"
        profileUsername="testuser"
        gigs={mockGigs}
        currentUserId="viewer-1"
        isOwnProfile={false}
        existingTestimonialGigIds={new Set()}
      />
    );

    const buttons = screen.getAllByText("Leave Testimonial");
    expect(buttons).toHaveLength(2);
  });

  it("hides Leave Testimonial button for own profile", () => {
    render(
      <CompletedGigs
        profileId="user-1"
        profileUsername="testuser"
        gigs={mockGigs}
        currentUserId="user-1"
        isOwnProfile={true}
        existingTestimonialGigIds={new Set()}
      />
    );

    expect(screen.queryByText("Leave Testimonial")).not.toBeInTheDocument();
  });

  it("hides Leave Testimonial button when not logged in", () => {
    render(
      <CompletedGigs
        profileId="user-1"
        profileUsername="testuser"
        gigs={mockGigs}
        currentUserId={null}
        isOwnProfile={false}
        existingTestimonialGigIds={new Set()}
      />
    );

    expect(screen.queryByText("Leave Testimonial")).not.toBeInTheDocument();
  });

  it("shows 'Testimonial submitted' for already reviewed gigs", () => {
    render(
      <CompletedGigs
        profileId="user-1"
        profileUsername="testuser"
        gigs={mockGigs}
        currentUserId="viewer-1"
        isOwnProfile={false}
        existingTestimonialGigIds={new Set(["gig-1"])}
      />
    );

    expect(screen.getByText("Testimonial submitted")).toBeInTheDocument();
    // Only one Leave Testimonial button (for gig-2)
    expect(screen.getAllByText("Leave Testimonial")).toHaveLength(1);
  });

  it("expands testimonial form when clicking Leave Testimonial", () => {
    render(
      <CompletedGigs
        profileId="user-1"
        profileUsername="testuser"
        gigs={[mockGigs[0]]}
        currentUserId="viewer-1"
        isOwnProfile={false}
        existingTestimonialGigIds={new Set()}
      />
    );

    fireEvent.click(screen.getByText("Leave Testimonial"));

    expect(screen.getByPlaceholderText(/How did testuser do/)).toBeInTheDocument();
    expect(screen.getByText("Submit Testimonial")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("collapses form on Cancel", () => {
    render(
      <CompletedGigs
        profileId="user-1"
        profileUsername="testuser"
        gigs={[mockGigs[0]]}
        currentUserId="viewer-1"
        isOwnProfile={false}
        existingTestimonialGigIds={new Set()}
      />
    );

    fireEvent.click(screen.getByText("Leave Testimonial"));
    expect(screen.getByText("Cancel")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
    expect(screen.getByText("Leave Testimonial")).toBeInTheDocument();
  });

  it("submits testimonial successfully", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { id: "t-1" } }),
    });

    render(
      <CompletedGigs
        profileId="user-1"
        profileUsername="testuser"
        gigs={[mockGigs[0]]}
        currentUserId="viewer-1"
        isOwnProfile={false}
        existingTestimonialGigIds={new Set()}
      />
    );

    fireEvent.click(screen.getByText("Leave Testimonial"));

    // Set rating
    fireEvent.click(screen.getByTestId("set-rating"));

    // Type content
    fireEvent.change(screen.getByPlaceholderText(/How did testuser do/), {
      target: { value: "Great work on this project!" },
    });

    fireEvent.click(screen.getByText("Submit Testimonial"));

    await waitFor(() => {
      expect(screen.getByText("Testimonial submitted")).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/testimonials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile_id: "user-1",
        gig_id: "gig-1",
        rating: 5,
        content: "Great work on this project!",
      }),
    });
  });

  it("shows error when submission fails", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Already submitted" }),
    });

    render(
      <CompletedGigs
        profileId="user-1"
        profileUsername="testuser"
        gigs={[mockGigs[0]]}
        currentUserId="viewer-1"
        isOwnProfile={false}
        existingTestimonialGigIds={new Set()}
      />
    );

    fireEvent.click(screen.getByText("Leave Testimonial"));
    fireEvent.click(screen.getByTestId("set-rating"));
    fireEvent.change(screen.getByPlaceholderText(/How did testuser do/), {
      target: { value: "Nice work" },
    });
    fireEvent.click(screen.getByText("Submit Testimonial"));

    await waitFor(() => {
      expect(screen.getByText("Already submitted")).toBeInTheDocument();
    });
  });

  it("shows budget amount when available", () => {
    render(
      <CompletedGigs
        profileId="user-1"
        profileUsername="testuser"
        gigs={[mockGigs[0]]}
        currentUserId={null}
        isOwnProfile={false}
        existingTestimonialGigIds={new Set()}
      />
    );

    expect(screen.getByText("500")).toBeInTheDocument();
  });

  it("links to gig and poster profile", () => {
    render(
      <CompletedGigs
        profileId="user-1"
        profileUsername="testuser"
        gigs={[mockGigs[0]]}
        currentUserId={null}
        isOwnProfile={false}
        existingTestimonialGigIds={new Set()}
      />
    );

    const gigLink = screen.getByText("Build a Website").closest("a");
    expect(gigLink).toHaveAttribute("href", "/gigs/gig-1");

    const posterLink = screen.getByText("Alice Smith").closest("a");
    expect(posterLink).toHaveAttribute("href", "/u/alice");
  });
});
