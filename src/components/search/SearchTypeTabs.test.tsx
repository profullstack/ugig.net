import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchTypeTabs, type SearchTab } from "./SearchTypeTabs";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SearchTypeTabs", () => {
  // ── Rendering ──────────────────────────────────────────────────

  it("renders all four tabs", () => {
    render(<SearchTypeTabs activeTab="all" onTabChange={vi.fn()} />);

    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Gigs")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("Posts")).toBeInTheDocument();
  });

  // ── Tab switching ──────────────────────────────────────────────

  it("calls onTabChange with correct value when clicking a tab", async () => {
    const onTabChange = vi.fn();
    const user = userEvent.setup();

    render(<SearchTypeTabs activeTab="all" onTabChange={onTabChange} />);

    await user.click(screen.getByText("Gigs"));
    expect(onTabChange).toHaveBeenCalledWith("gigs");

    await user.click(screen.getByText("Agents"));
    expect(onTabChange).toHaveBeenCalledWith("agents");

    await user.click(screen.getByText("Posts"));
    expect(onTabChange).toHaveBeenCalledWith("posts");

    await user.click(screen.getByText("All"));
    expect(onTabChange).toHaveBeenCalledWith("all");
  });

  // ── Count display ──────────────────────────────────────────────

  it("displays counts next to tab labels", () => {
    render(
      <SearchTypeTabs
        activeTab="all"
        onTabChange={vi.fn()}
        counts={{ gigs: 12, agents: 5, posts: 3 }}
      />
    );

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("does not display count for All tab", () => {
    render(
      <SearchTypeTabs
        activeTab="all"
        onTabChange={vi.fn()}
        counts={{ gigs: 10, agents: 5, posts: 3 }}
      />
    );

    // All tab should just say "All" without a count
    const allButton = screen.getByText("All").closest("button");
    expect(allButton?.textContent).toBe("All");
  });

  it("does not display count badges when count is 0", () => {
    render(
      <SearchTypeTabs
        activeTab="all"
        onTabChange={vi.fn()}
        counts={{ gigs: 0, agents: 0, posts: 0 }}
      />
    );

    // No count badges should be rendered (count > 0 check)
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows 99+ when count exceeds 99", () => {
    render(
      <SearchTypeTabs
        activeTab="all"
        onTabChange={vi.fn()}
        counts={{ gigs: 150, agents: 1, posts: 1 }}
      />
    );

    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("renders without counts prop (undefined)", () => {
    render(<SearchTypeTabs activeTab="gigs" onTabChange={vi.fn()} />);

    // Should render tabs without errors
    expect(screen.getByText("Gigs")).toBeInTheDocument();
    // No count badges
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  // ── Active state ───────────────────────────────────────────────

  it("highlights the active tab", () => {
    const { rerender } = render(
      <SearchTypeTabs activeTab="gigs" onTabChange={vi.fn()} />
    );

    // The active tab button should contain the active indicator div
    const gigsButton = screen.getByText("Gigs").closest("button");
    expect(gigsButton).toBeDefined();
    // Active tab has text-foreground class, others have text-muted-foreground
    expect(gigsButton?.className).toContain("text-foreground");

    const allButton = screen.getByText("All").closest("button");
    expect(allButton?.className).toContain("text-muted-foreground");

    // Re-render with different active tab
    rerender(<SearchTypeTabs activeTab="agents" onTabChange={vi.fn()} />);

    const agentsButton = screen.getByText("Agents").closest("button");
    expect(agentsButton?.className).toContain("text-foreground");

    const gigsButtonAfter = screen.getByText("Gigs").closest("button");
    expect(gigsButtonAfter?.className).toContain("text-muted-foreground");
  });
});
