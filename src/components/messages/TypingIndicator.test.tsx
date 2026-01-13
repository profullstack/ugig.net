import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TypingIndicator } from "./TypingIndicator";

describe("TypingIndicator", () => {
  it("renders with default text when no username provided", () => {
    render(<TypingIndicator />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Typing...")).toBeInTheDocument();
  });

  it("renders with username when provided", () => {
    render(<TypingIndicator userName="John Doe" />);

    expect(screen.getByText("John Doe is typing...")).toBeInTheDocument();
  });

  it("has correct aria-label for accessibility", () => {
    render(<TypingIndicator userName="Jane" />);

    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      "Jane is typing"
    );
  });

  it("has correct aria-label when no username", () => {
    render(<TypingIndicator />);

    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      "Someone is typing"
    );
  });

  it("renders animated dots", () => {
    const { container } = render(<TypingIndicator />);

    const dots = container.querySelectorAll(".animate-bounce");
    expect(dots).toHaveLength(3);
  });

  it("applies custom className", () => {
    const { container } = render(<TypingIndicator className="custom-class" />);

    expect(container.firstChild).toHaveClass("custom-class");
  });
});
