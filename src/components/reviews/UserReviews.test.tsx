import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UserReviews } from "./UserReviews";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock the API
vi.mock("@/lib/api", () => ({
  reviews: {
    getForUser: vi.fn(),
  },
}));

import { reviews as reviewsApi } from "@/lib/api";

const mockReviews = [
  {
    id: "review-1",
    rating: 5,
    comment: "Excellent work!",
    created_at: "2024-01-15T10:30:00Z",
    reviewer: {
      id: "user-1",
      username: "johndoe",
      full_name: "John Doe",
      avatar_url: null,
    },
    gig: {
      id: "gig-1",
      title: "Build a React App",
    },
  },
  {
    id: "review-2",
    rating: 4,
    comment: "Good job!",
    created_at: "2024-01-10T08:00:00Z",
    reviewer: {
      id: "user-2",
      username: "janedoe",
      full_name: "Jane Doe",
      avatar_url: null,
    },
    gig: {
      id: "gig-2",
      title: "Create a Landing Page",
    },
  },
];

describe("UserReviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reviewsApi.getForUser).mockResolvedValue({
      data: {
        data: mockReviews,
        summary: { average_rating: 4.5, total_reviews: 2 },
        pagination: { total: 2 },
      },
      error: null,
    });
  });

  it("shows loading state initially", () => {
    render(<UserReviews username="testuser" />);

    // Should show skeleton loaders (animate-pulse class)
    const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("displays average rating", async () => {
    render(<UserReviews username="testuser" />);

    await waitFor(() => {
      expect(screen.getByText("4.5")).toBeInTheDocument();
    });
  });

  it("displays total reviews count", async () => {
    render(<UserReviews username="testuser" />);

    await waitFor(() => {
      expect(screen.getByText("Based on 2 reviews")).toBeInTheDocument();
    });
  });

  it("uses singular 'review' for 1 review", async () => {
    vi.mocked(reviewsApi.getForUser).mockResolvedValue({
      data: {
        data: [mockReviews[0]],
        summary: { average_rating: 5.0, total_reviews: 1 },
        pagination: { total: 1 },
      },
      error: null,
    });

    render(<UserReviews username="testuser" />);

    await waitFor(() => {
      expect(screen.getByText("Based on 1 review")).toBeInTheDocument();
    });
  });

  it("displays review cards", async () => {
    render(<UserReviews username="testuser" />);

    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    });
  });

  it("displays review comments", async () => {
    render(<UserReviews username="testuser" />);

    await waitFor(() => {
      expect(screen.getByText("Excellent work!")).toBeInTheDocument();
      expect(screen.getByText("Good job!")).toBeInTheDocument();
    });
  });

  it("shows 'No reviews yet' when empty", async () => {
    vi.mocked(reviewsApi.getForUser).mockResolvedValue({
      data: {
        data: [],
        summary: { average_rating: 0, total_reviews: 0 },
        pagination: { total: 0 },
      },
      error: null,
    });

    render(<UserReviews username="testuser" />);

    await waitFor(() => {
      expect(screen.getByText("No reviews yet")).toBeInTheDocument();
    });
  });

  it("calls API with correct username", async () => {
    render(<UserReviews username="johndoe" />);

    await waitFor(() => {
      expect(reviewsApi.getForUser).toHaveBeenCalledWith("johndoe", { limit: 5 });
    });
  });

  it("shows Load more button when there are more reviews", async () => {
    vi.mocked(reviewsApi.getForUser).mockResolvedValue({
      data: {
        data: mockReviews,
        summary: { average_rating: 4.5, total_reviews: 10 },
        pagination: { total: 10 },
      },
      error: null,
    });

    render(<UserReviews username="testuser" />);

    await waitFor(() => {
      expect(screen.getByText("Load more reviews")).toBeInTheDocument();
    });
  });

  it("hides Load more button when all reviews are loaded", async () => {
    render(<UserReviews username="testuser" />);

    await waitFor(() => {
      expect(screen.queryByText("Load more reviews")).not.toBeInTheDocument();
    });
  });

  it("loads more reviews when button is clicked", async () => {
    vi.mocked(reviewsApi.getForUser)
      .mockResolvedValueOnce({
        data: {
          data: mockReviews,
          summary: { average_rating: 4.5, total_reviews: 5 },
          pagination: { total: 5 },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          data: [
            {
              id: "review-3",
              rating: 3,
              comment: "Okay work",
              created_at: "2024-01-05T10:00:00Z",
              reviewer: {
                id: "user-3",
                username: "bob",
                full_name: "Bob Smith",
                avatar_url: null,
              },
              gig: null,
            },
          ],
          summary: { average_rating: 4.0, total_reviews: 5 },
          pagination: { total: 5 },
        },
        error: null,
      });

    render(<UserReviews username="testuser" />);

    await waitFor(() => {
      expect(screen.getByText("Load more reviews")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Load more reviews"));

    await waitFor(() => {
      expect(reviewsApi.getForUser).toHaveBeenCalledWith("testuser", {
        limit: 5,
        offset: 2,
      });
    });
  });

  it("shows loading state when loading more", async () => {
    vi.mocked(reviewsApi.getForUser)
      .mockResolvedValueOnce({
        data: {
          data: mockReviews,
          summary: { average_rating: 4.5, total_reviews: 5 },
          pagination: { total: 5 },
        },
        error: null,
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  data: {
                    data: [],
                    summary: { average_rating: 4.5, total_reviews: 5 },
                    pagination: { total: 5 },
                  },
                  error: null,
                }),
              100
            )
          )
      );

    render(<UserReviews username="testuser" />);

    await waitFor(() => {
      expect(screen.getByText("Load more reviews")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Load more reviews"));

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("appends new reviews to existing ones", async () => {
    vi.mocked(reviewsApi.getForUser)
      .mockResolvedValueOnce({
        data: {
          data: mockReviews,
          summary: { average_rating: 4.5, total_reviews: 3 },
          pagination: { total: 3 },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          data: [
            {
              id: "review-3",
              rating: 3,
              comment: "Third review",
              created_at: "2024-01-05T10:00:00Z",
              reviewer: {
                id: "user-3",
                username: "bob",
                full_name: "Bob Smith",
                avatar_url: null,
              },
              gig: null,
            },
          ],
          summary: { average_rating: 4.0, total_reviews: 3 },
          pagination: { total: 3 },
        },
        error: null,
      });

    render(<UserReviews username="testuser" />);

    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Load more reviews"));

    await waitFor(() => {
      expect(screen.getByText("Bob Smith")).toBeInTheDocument();
      // Original reviews should still be there
      expect(screen.getByText("John Doe")).toBeInTheDocument();
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    });
  });

  it("displays star rating in summary", async () => {
    render(<UserReviews username="testuser" />);

    await waitFor(() => {
      // The StarRating component should render stars
      expect(screen.getByText("4.5")).toBeInTheDocument();
    });
  });
});
