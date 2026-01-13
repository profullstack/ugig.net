import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StarRating } from "./StarRating";

describe("StarRating", () => {
  it("renders correct number of stars", () => {
    const { container } = render(<StarRating rating={3} />);

    const stars = container.querySelectorAll("button");
    expect(stars).toHaveLength(5);
  });

  it("renders custom max rating", () => {
    const { container } = render(<StarRating rating={3} maxRating={10} />);

    const stars = container.querySelectorAll("button");
    expect(stars).toHaveLength(10);
  });

  it("displays correct number of filled stars", () => {
    const { container } = render(<StarRating rating={3} />);

    const filledStars = container.querySelectorAll(".fill-yellow-400");
    expect(filledStars).toHaveLength(3);
  });

  it("has correct aria-label", () => {
    render(<StarRating rating={4} />);

    expect(
      screen.getByRole("img", { name: "Rating: 4 out of 5 stars" })
    ).toBeInTheDocument();
  });

  it("is non-interactive by default", () => {
    const onChange = vi.fn();
    const { container } = render(<StarRating rating={3} onChange={onChange} />);

    const buttons = container.querySelectorAll("button");
    buttons.forEach((button) => {
      expect(button).toBeDisabled();
    });

    fireEvent.click(buttons[0]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("is interactive when interactive prop is true", () => {
    const onChange = vi.fn();
    const { container } = render(
      <StarRating rating={3} interactive onChange={onChange} />
    );

    const buttons = container.querySelectorAll("button");
    buttons.forEach((button) => {
      expect(button).not.toBeDisabled();
    });
  });

  it("calls onChange when star is clicked in interactive mode", () => {
    const onChange = vi.fn();
    const { container } = render(
      <StarRating rating={3} interactive onChange={onChange} />
    );

    const buttons = container.querySelectorAll("button");
    fireEvent.click(buttons[4]); // Click 5th star

    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("renders different sizes", () => {
    const { rerender, container } = render(<StarRating rating={3} size="sm" />);
    expect(container.querySelector(".h-4")).toBeInTheDocument();

    rerender(<StarRating rating={3} size="md" />);
    expect(container.querySelector(".h-5")).toBeInTheDocument();

    rerender(<StarRating rating={3} size="lg" />);
    expect(container.querySelector(".h-6")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <StarRating rating={3} className="custom-class" />
    );

    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("has slider role when interactive", () => {
    render(<StarRating rating={3} interactive />);

    expect(screen.getByRole("slider")).toBeInTheDocument();
  });

  it("displays all stars as unfilled when rating is 0", () => {
    const { container } = render(<StarRating rating={0} />);

    const filledStars = container.querySelectorAll(".fill-yellow-400");
    expect(filledStars).toHaveLength(0);
  });
});
