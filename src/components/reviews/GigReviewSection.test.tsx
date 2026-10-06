import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { GigReviewSection } from "./GigReviewSection";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/api", () => ({
  reviews: { create: vi.fn() },
}));

import { reviews as reviewsApi } from "@/lib/api";

const alice = { id: "alice-id", username: "alice", full_name: "Alice A", avatar_url: null };
const bob = { id: "bob-id", username: "bob", full_name: null, avatar_url: null };

describe("GigReviewSection", () => {
  afterEach(() => cleanup());
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing when there is nobody left to review", () => {
    const { container } = render(<GigReviewSection gigId="gig-1" targets={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one review form per target, anchored at #review", () => {
    const { container } = render(<GigReviewSection gigId="gig-1" targets={[alice, bob]} />);
    expect(container.querySelector("section#review")).not.toBeNull();
    expect(screen.getByText("Rate Alice A")).toBeInTheDocument();
    expect(screen.getByText("Rate @bob")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Submit Review" })).toHaveLength(2);
    // distinct comment ids, so each label points at its own textarea
    const ids = screen.getAllByRole("textbox").map((t) => t.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("posts the review for the right person and hides that form once submitted", async () => {
    vi.mocked(reviewsApi.create).mockResolvedValue({ data: { id: "r1" }, error: null } as never);
    render(<GigReviewSection gigId="gig-1" targets={[alice, bob]} />);

    const aliceForm = screen.getByTestId("review-target-alice-id");
    // 5th star in Alice's form
    const stars = aliceForm.querySelectorAll("button[type='button']");
    fireEvent.click(stars[4]);
    fireEvent.click(aliceForm.querySelector("button[type='submit']")!);

    await waitFor(() => expect(screen.queryByText("Rate Alice A")).not.toBeInTheDocument());
    expect(reviewsApi.create).toHaveBeenCalledWith({
      gig_id: "gig-1",
      reviewee_id: "alice-id",
      rating: 5,
      comment: undefined,
    });
    expect(screen.getByText("Rate @bob")).toBeInTheDocument();
  });

  it("thanks the user once every form is submitted", async () => {
    vi.mocked(reviewsApi.create).mockResolvedValue({ data: { id: "r1" }, error: null } as never);
    render(<GigReviewSection gigId="gig-1" targets={[bob]} />);

    const form = screen.getByTestId("review-target-bob-id");
    fireEvent.click(form.querySelectorAll("button[type='button']")[3]);
    fireEvent.click(form.querySelector("button[type='submit']")!);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("your review is posted"));
  });
});
