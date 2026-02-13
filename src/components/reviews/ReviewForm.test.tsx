import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ReviewForm } from "./ReviewForm";

// Mock the API
vi.mock("@/lib/api", () => ({
  reviews: {
    create: vi.fn(),
  },
}));

import { reviews as reviewsApi } from "@/lib/api";

describe("ReviewForm", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the form with reviewee name", () => {
    render(
      <ReviewForm
        gigId="gig-123"
        revieweeId="user-456"
        revieweeName="John Doe"
      />
    );

    expect(screen.getByText("Rate John Doe")).toBeInTheDocument();
  });

  it("renders star rating component", () => {
    render(
      <ReviewForm
        gigId="gig-123"
        revieweeId="user-456"
        revieweeName="John Doe"
      />
    );

    // Should have interactive stars
    const buttons = screen.getAllByRole("button");
    // First 5 should be star buttons, last 1 is submit button
    expect(buttons.length).toBeGreaterThanOrEqual(6);
  });

  it("renders comment textarea", () => {
    render(
      <ReviewForm
        gigId="gig-123"
        revieweeId="user-456"
        revieweeName="John Doe"
      />
    );

    expect(screen.getByLabelText(/Review/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Share your experience/)).toBeInTheDocument();
  });

  it("shows character count", () => {
    render(
      <ReviewForm
        gigId="gig-123"
        revieweeId="user-456"
        revieweeName="John Doe"
      />
    );

    expect(screen.getByText("0/2000")).toBeInTheDocument();
  });

  it("updates character count on input", () => {
    render(
      <ReviewForm
        gigId="gig-123"
        revieweeId="user-456"
        revieweeName="John Doe"
      />
    );

    const textarea = screen.getByPlaceholderText(/Share your experience/);
    fireEvent.change(textarea, { target: { value: "Great work!" } });

    expect(screen.getByText("11/2000")).toBeInTheDocument();
  });

  it("shows rating description when rating is selected", async () => {
    render(
      <ReviewForm
        gigId="gig-123"
        revieweeId="user-456"
        revieweeName="John Doe"
      />
    );

    // Click on 5th star for Excellent using aria-label
    const fifthStar = screen.getByRole("button", { name: "5 stars" });
    fireEvent.click(fifthStar);

    await waitFor(() => {
      expect(screen.getByText("Excellent")).toBeInTheDocument();
    });
  });

  it("shows error when submitting without rating", async () => {
    render(
      <ReviewForm
        gigId="gig-123"
        revieweeId="user-456"
        revieweeName="John Doe"
      />
    );

    // Need to first enable the submit button by selecting a rating, then deselect
    // Actually, the submit button is disabled when rating is 0, so we can't click it
    // The error only shows when form is submitted with rating 0
    // Let me check if form validation works differently

    // The form onSubmit shows the error, but button is disabled
    // Let's check that the validation error shows on form submit attempt
    const form = document.querySelector("form");
    if (form) {
      fireEvent.submit(form);
    }

    await waitFor(() => {
      expect(screen.getByText("Please select a rating")).toBeInTheDocument();
    });
  });

  it("submit button is disabled when rating is 0", () => {
    render(
      <ReviewForm
        gigId="gig-123"
        revieweeId="user-456"
        revieweeName="John Doe"
      />
    );

    const submitButton = screen.getByText("Submit Review");
    expect(submitButton).toBeDisabled();
  });

  it("submit button is enabled when rating is selected", async () => {
    render(
      <ReviewForm
        gigId="gig-123"
        revieweeId="user-456"
        revieweeName="John Doe"
      />
    );

    // Click on a star using aria-label
    const fourthStar = screen.getByRole("button", { name: "4 stars" });
    fireEvent.click(fourthStar);

    await waitFor(() => {
      const submitButton = screen.getByText("Submit Review");
      expect(submitButton).not.toBeDisabled();
    });
  });

  it("calls API with correct data on submit", async () => {
    vi.mocked(reviewsApi.create).mockResolvedValue({ data: {}, error: null });

    render(
      <ReviewForm
        gigId="gig-123"
        revieweeId="user-456"
        revieweeName="John Doe"
      />
    );

    // Set rating using aria-label
    const fifthStar = screen.getByRole("button", { name: "5 stars" });
    fireEvent.click(fifthStar);

    // Add comment
    const textarea = screen.getByPlaceholderText(/Share your experience/);
    fireEvent.change(textarea, { target: { value: "Amazing work!" } });

    // Submit
    const submitButton = screen.getByText("Submit Review");
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(reviewsApi.create).toHaveBeenCalledWith({
        gig_id: "gig-123",
        reviewee_id: "user-456",
        rating: 5,
        comment: "Amazing work!",
      });
    });
  });

  it("calls onSuccess after successful submission", async () => {
    vi.mocked(reviewsApi.create).mockResolvedValue({ data: {}, error: null });
    const onSuccess = vi.fn();

    render(
      <ReviewForm
        gigId="gig-123"
        revieweeId="user-456"
        revieweeName="John Doe"
        onSuccess={onSuccess}
      />
    );

    // Set rating using aria-label
    const fourthStar = screen.getByRole("button", { name: "4 stars" });
    fireEvent.click(fourthStar);

    // Submit
    const submitButton = screen.getByText("Submit Review");
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it("shows error on API failure", async () => {
    vi.mocked(reviewsApi.create).mockResolvedValue({
      data: null,
      error: "You already reviewed this user",
    });

    render(
      <ReviewForm
        gigId="gig-123"
        revieweeId="user-456"
        revieweeName="John Doe"
      />
    );

    // Set rating using aria-label
    const fourthStar = screen.getByRole("button", { name: "4 stars" });
    fireEvent.click(fourthStar);

    // Submit
    const submitButton = screen.getByText("Submit Review");
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("You already reviewed this user")).toBeInTheDocument();
    });
  });

  it("renders cancel button when onCancel is provided", () => {
    const onCancel = vi.fn();

    render(
      <ReviewForm
        gigId="gig-123"
        revieweeId="user-456"
        revieweeName="John Doe"
        onCancel={onCancel}
      />
    );

    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();

    render(
      <ReviewForm
        gigId="gig-123"
        revieweeId="user-456"
        revieweeName="John Doe"
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByText("Cancel"));

    expect(onCancel).toHaveBeenCalled();
  });

  it("does not show cancel button when onCancel is not provided", () => {
    render(
      <ReviewForm
        gigId="gig-123"
        revieweeId="user-456"
        revieweeName="John Doe"
      />
    );

    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
  });

  it("shows loading state while submitting", async () => {
    vi.mocked(reviewsApi.create).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: {}, error: null }), 100))
    );

    render(
      <ReviewForm
        gigId="gig-123"
        revieweeId="user-456"
        revieweeName="John Doe"
      />
    );

    // Set rating using aria-label
    const fourthStar = screen.getByRole("button", { name: "4 stars" });
    fireEvent.click(fourthStar);

    // Submit
    const submitButton = screen.getByText("Submit Review");
    fireEvent.click(submitButton);

    expect(screen.getByText("Submitting...")).toBeInTheDocument();
  });

  it("trims comment before sending", async () => {
    vi.mocked(reviewsApi.create).mockResolvedValue({ data: {}, error: null });

    render(
      <ReviewForm
        gigId="gig-123"
        revieweeId="user-456"
        revieweeName="John Doe"
      />
    );

    // Set rating using aria-label
    const fourthStar = screen.getByRole("button", { name: "4 stars" });
    fireEvent.click(fourthStar);

    // Add comment with whitespace
    const textarea = screen.getByPlaceholderText(/Share your experience/);
    fireEvent.change(textarea, { target: { value: "  Great work!  " } });

    // Submit
    const submitButton = screen.getByText("Submit Review");
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(reviewsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          comment: "Great work!",
        })
      );
    });
  });

  it("sends undefined comment when empty", async () => {
    vi.mocked(reviewsApi.create).mockResolvedValue({ data: {}, error: null });

    render(
      <ReviewForm
        gigId="gig-123"
        revieweeId="user-456"
        revieweeName="John Doe"
      />
    );

    // Set rating only using aria-label
    const fourthStar = screen.getByRole("button", { name: "4 stars" });
    fireEvent.click(fourthStar);

    // Submit without comment
    const submitButton = screen.getByText("Submit Review");
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(reviewsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          comment: undefined,
        })
      );
    });
  });
});
