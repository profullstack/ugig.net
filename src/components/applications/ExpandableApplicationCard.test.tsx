import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExpandableApplicationCard } from "./ExpandableApplicationCard";

describe("ExpandableApplicationCard", () => {
  const defaultProps = {
    applicationId: "test-123",
    header: <div data-testid="header-content">John Doe - Accepted</div>,
    children: <div data-testid="detail-content">Cover letter and details here</div>,
  };

  it("renders the header", () => {
    render(<ExpandableApplicationCard {...defaultProps} />);
    expect(screen.getByTestId("header-content")).toBeInTheDocument();
  });

  it("is collapsed by default", () => {
    render(<ExpandableApplicationCard {...defaultProps} />);
    expect(screen.queryByTestId("detail-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("expand-application-test-123")).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("expands when clicked", () => {
    render(<ExpandableApplicationCard {...defaultProps} />);
    fireEvent.click(screen.getByTestId("expand-application-test-123"));
    expect(screen.getByTestId("detail-content")).toBeInTheDocument();
    expect(screen.getByTestId("expand-application-test-123")).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("collapses when clicked again", () => {
    render(<ExpandableApplicationCard {...defaultProps} />);
    const button = screen.getByTestId("expand-application-test-123");
    fireEvent.click(button);
    expect(screen.getByTestId("detail-content")).toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.queryByTestId("detail-content")).not.toBeInTheDocument();
  });
});
