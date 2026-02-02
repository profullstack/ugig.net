import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VerifiedBadge } from "./VerifiedBadge";

describe("VerifiedBadge", () => {
  // ── Renders nothing when not verified ─────────────────────────

  it("renders nothing when verificationType is null", () => {
    const { container } = render(<VerifiedBadge verificationType={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when verificationType is undefined", () => {
    const { container } = render(<VerifiedBadge />);
    expect(container.innerHTML).toBe("");
  });

  // ── Badge colors ──────────────────────────────────────────────

  it("renders blue badge for auto-verified", () => {
    const { container } = render(<VerifiedBadge verificationType="auto" />);
    const span = container.querySelector("span");
    expect(span).toBeTruthy();
    expect(span!.getAttribute("title")).toBe("Auto-Verified");
    // Check the SVG icon has blue color class
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg!.className.baseVal || svg!.getAttribute("class")).toContain("text-blue-500");
  });

  it("renders blue badge for manual-verified", () => {
    const { container } = render(<VerifiedBadge verificationType="manual" />);
    const span = container.querySelector("span");
    expect(span).toBeTruthy();
    expect(span!.getAttribute("title")).toBe("Verified");
    const svg = container.querySelector("svg");
    expect(svg!.className.baseVal || svg!.getAttribute("class")).toContain("text-blue-500");
  });

  it("renders gold/amber badge for premium", () => {
    const { container } = render(<VerifiedBadge verificationType="premium" />);
    const span = container.querySelector("span");
    expect(span).toBeTruthy();
    expect(span!.getAttribute("title")).toBe("Premium Verified");
    const svg = container.querySelector("svg");
    expect(svg!.className.baseVal || svg!.getAttribute("class")).toContain("text-amber-500");
  });

  // ── Sizes ─────────────────────────────────────────────────────

  it("renders with default size", () => {
    const { container } = render(<VerifiedBadge verificationType="auto" />);
    const svg = container.querySelector("svg");
    const classes = svg!.className.baseVal || svg!.getAttribute("class") || "";
    expect(classes).toContain("h-4");
    expect(classes).toContain("w-4");
  });

  it("renders with sm size", () => {
    const { container } = render(
      <VerifiedBadge verificationType="auto" size="sm" />
    );
    const svg = container.querySelector("svg");
    const classes = svg!.className.baseVal || svg!.getAttribute("class") || "";
    expect(classes).toContain("h-3.5");
    expect(classes).toContain("w-3.5");
  });

  it("renders with lg size", () => {
    const { container } = render(
      <VerifiedBadge verificationType="auto" size="lg" />
    );
    const svg = container.querySelector("svg");
    const classes = svg!.className.baseVal || svg!.getAttribute("class") || "";
    expect(classes).toContain("h-5");
    expect(classes).toContain("w-5");
  });

  // ── Label ─────────────────────────────────────────────────────

  it("does not show label by default", () => {
    const { container } = render(<VerifiedBadge verificationType="auto" />);
    expect(container.textContent).toBe("");
  });

  it("shows 'Auto-Verified' label when showLabel is true for auto type", () => {
    const { container } = render(
      <VerifiedBadge verificationType="auto" showLabel />
    );
    expect(container.textContent).toContain("Auto-Verified");
  });

  it("shows 'Premium Verified' label when showLabel is true for premium type", () => {
    const { container } = render(
      <VerifiedBadge verificationType="premium" showLabel />
    );
    expect(container.textContent).toContain("Premium Verified");
  });

  it("shows 'Verified' label when showLabel is true for manual type", () => {
    const { container } = render(
      <VerifiedBadge verificationType="manual" showLabel />
    );
    expect(container.textContent).toContain("Verified");
  });

  // ── Custom className ──────────────────────────────────────────

  it("applies custom className", () => {
    const { container } = render(
      <VerifiedBadge verificationType="auto" className="custom-class" />
    );
    const span = container.querySelector("span");
    expect(span!.className).toContain("custom-class");
  });

  // ── Title attribute ───────────────────────────────────────────

  it("has correct title attribute for each type", () => {
    const types = [
      { type: "auto" as const, title: "Auto-Verified" },
      { type: "manual" as const, title: "Verified" },
      { type: "premium" as const, title: "Premium Verified" },
    ];

    for (const { type, title } of types) {
      const { container, unmount } = render(
        <VerifiedBadge verificationType={type} />
      );
      const span = container.querySelector("span");
      expect(span!.getAttribute("title")).toBe(title);
      unmount();
    }
  });
});
