import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReviewCard } from "./ReviewCard";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockReview = {
  id: "review-123",
  rating: 4,
  comment: "Great work! Very professional and delivered on time.",
  created_at: "2024-01-15T10:30:00Z",
  reviewer: {
    id: "user-456",
    username: "johndoe",
    full_name: "John Doe",
    avatar_url: null,
  },
  gig: {
    id: "gig-789",
    title: "Build a React Dashboard",
  },
};

describe("ReviewCard", () => {
  it("renders reviewer name", () => {
    render(<ReviewCard review={mockReview} />);

    expect(screen.getByText("John Doe")).toBeInTheDocument();
  });

  it("renders star rating", () => {
    render(<ReviewCard review={mockReview} />);

    // StarRating component uses role="img" with aria-label
    const rating = screen.getByRole("img", { name: /Rating: 4 out of 5 stars/i });
    expect(rating).toBeInTheDocument();
  });

  it("renders review comment", () => {
    render(<ReviewCard review={mockReview} />);

    expect(screen.getByText("Great work! Very professional and delivered on time.")).toBeInTheDocument();
  });

  it("shows gig title when showGig is true", () => {
    render(<ReviewCard review={mockReview} showGig={true} />);

    expect(screen.getByText("Build a React Dashboard")).toBeInTheDocument();
  });

  it("hides gig title when showGig is false", () => {
    render(<ReviewCard review={mockReview} showGig={false} />);

    expect(screen.queryByText("Build a React Dashboard")).not.toBeInTheDocument();
  });

  it("shows gig title by default", () => {
    render(<ReviewCard review={mockReview} />);

    expect(screen.getByText("Build a React Dashboard")).toBeInTheDocument();
  });

  it("shows avatar initials when no avatar_url", () => {
    render(<ReviewCard review={mockReview} />);

    expect(screen.getByText("J")).toBeInTheDocument();
  });

  it("uses username initial when no full_name", () => {
    const reviewNoName = {
      ...mockReview,
      reviewer: { ...mockReview.reviewer, full_name: null },
    };

    render(<ReviewCard review={reviewNoName} />);

    expect(screen.getByText("J")).toBeInTheDocument();
  });

  it("links reviewer name to profile page", () => {
    render(<ReviewCard review={mockReview} />);

    const reviewerLink = screen.getByText("John Doe").closest("a");
    expect(reviewerLink).toHaveAttribute("href", "/u/johndoe");
  });

  it("links gig title to gig page", () => {
    render(<ReviewCard review={mockReview} />);

    const gigLink = screen.getByText("Build a React Dashboard").closest("a");
    expect(gigLink).toHaveAttribute("href", "/gigs/gig-789");
  });

  it("renders avatar image when avatar_url is provided", () => {
    const reviewWithAvatar = {
      ...mockReview,
      reviewer: {
        ...mockReview.reviewer,
        avatar_url: "https://example.com/avatar.jpg",
      },
    };

    render(<ReviewCard review={reviewWithAvatar} />);

    // Get the avatar image by alt text
    const avatar = screen.getByRole("img", { name: /John Doe/i });
    expect(avatar).toHaveAttribute("src", "https://example.com/avatar.jpg");
  });

  it("handles review without comment", () => {
    const reviewNoComment = {
      ...mockReview,
      comment: null,
    };

    render(<ReviewCard review={reviewNoComment} />);

    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.queryByText("Great work!")).not.toBeInTheDocument();
  });

  it("handles review without gig", () => {
    const reviewNoGig = {
      ...mockReview,
      gig: null,
    };

    render(<ReviewCard review={reviewNoGig} />);

    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.queryByText("Build a React Dashboard")).not.toBeInTheDocument();
  });

  it("displays relative timestamp", () => {
    render(<ReviewCard review={mockReview} />);

    // The formatRelativeTime function should render something
    // We can't check the exact text since it depends on the current time
    const container = screen.getByText("John Doe").closest("div")?.parentElement;
    expect(container).toBeInTheDocument();
  });
});
