import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchInput } from "./SearchInput";

const mockPush = vi.fn();

// Override the router mock from setup.tsx to capture push calls
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SearchInput", () => {
  // ── Rendering ──────────────────────────────────────────────────

  it("renders input with default placeholder", () => {
    render(<SearchInput />);
    expect(
      screen.getByPlaceholderText("Search gigs, agents, posts...")
    ).toBeInTheDocument();
  });

  it("renders input with custom placeholder", () => {
    render(<SearchInput placeholder="Find something" />);
    expect(
      screen.getByPlaceholderText("Find something")
    ).toBeInTheDocument();
  });

  it("renders with initial query value", () => {
    render(<SearchInput initialQuery="react" />);
    const input = screen.getByPlaceholderText("Search gigs, agents, posts...");
    expect(input).toHaveValue("react");
  });

  // ── Submit / onSearch ──────────────────────────────────────────

  it("calls onSearch callback on form submit (Enter)", async () => {
    const onSearch = vi.fn();
    const user = userEvent.setup();

    render(<SearchInput onSearch={onSearch} />);
    const input = screen.getByPlaceholderText("Search gigs, agents, posts...");

    await user.type(input, "typescript{Enter}");

    expect(onSearch).toHaveBeenCalledWith("typescript");
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("trims whitespace before calling onSearch", async () => {
    const onSearch = vi.fn();
    const user = userEvent.setup();

    render(<SearchInput onSearch={onSearch} />);
    const input = screen.getByPlaceholderText("Search gigs, agents, posts...");

    await user.type(input, "  react  {Enter}");

    expect(onSearch).toHaveBeenCalledWith("react");
  });

  it("does not call onSearch when query is empty", async () => {
    const onSearch = vi.fn();
    const user = userEvent.setup();

    render(<SearchInput onSearch={onSearch} />);
    const input = screen.getByPlaceholderText("Search gigs, agents, posts...");

    await user.type(input, "{Enter}");

    expect(onSearch).not.toHaveBeenCalled();
  });

  it("does not call onSearch when query is only whitespace", async () => {
    const onSearch = vi.fn();
    const user = userEvent.setup();

    render(<SearchInput onSearch={onSearch} />);
    const input = screen.getByPlaceholderText("Search gigs, agents, posts...");

    await user.type(input, "   {Enter}");

    expect(onSearch).not.toHaveBeenCalled();
  });

  it("navigates to /search when no onSearch prop", async () => {
    const user = userEvent.setup();

    render(<SearchInput />);
    const input = screen.getByPlaceholderText("Search gigs, agents, posts...");

    await user.type(input, "design{Enter}");

    expect(mockPush).toHaveBeenCalledWith("/search?q=design");
  });

  // ── Clear button ──────────────────────────────────────────────

  it("shows clear button when input has value", async () => {
    const user = userEvent.setup();
    render(<SearchInput />);
    const input = screen.getByPlaceholderText("Search gigs, agents, posts...");

    // No clear button initially
    expect(screen.queryByLabelText("Clear search")).not.toBeInTheDocument();

    await user.type(input, "test");

    // Clear button appears
    expect(screen.getByLabelText("Clear search")).toBeInTheDocument();
  });

  it("clears input when clear button is clicked", async () => {
    const user = userEvent.setup();
    render(<SearchInput />);
    const input = screen.getByPlaceholderText("Search gigs, agents, posts...");

    await user.type(input, "something");
    expect(input).toHaveValue("something");

    const clearBtn = screen.getByLabelText("Clear search");
    await user.click(clearBtn);

    expect(input).toHaveValue("");
    // Clear button should disappear
    expect(screen.queryByLabelText("Clear search")).not.toBeInTheDocument();
  });

  it("focuses input after clearing", async () => {
    const user = userEvent.setup();
    render(<SearchInput />);
    const input = screen.getByPlaceholderText("Search gigs, agents, posts...");

    await user.type(input, "test");
    const clearBtn = screen.getByLabelText("Clear search");
    await user.click(clearBtn);

    expect(input).toHaveFocus();
  });

  // ── Controlled value ──────────────────────────────────────────

  it("updates value when typing", async () => {
    const user = userEvent.setup();
    render(<SearchInput />);
    const input = screen.getByPlaceholderText("Search gigs, agents, posts...");

    await user.type(input, "hello");
    expect(input).toHaveValue("hello");
  });

  it("syncs when initialQuery prop changes", () => {
    const { rerender } = render(<SearchInput initialQuery="first" />);
    const input = screen.getByPlaceholderText("Search gigs, agents, posts...");
    expect(input).toHaveValue("first");

    rerender(<SearchInput initialQuery="second" />);
    expect(input).toHaveValue("second");
  });
});
