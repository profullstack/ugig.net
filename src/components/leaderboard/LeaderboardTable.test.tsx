import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LeaderboardTable } from "./LeaderboardTable";

// ── Mocks ──────────────────────────────────────────────────────────

// Mock next/image (not in global setup)
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as React.ImgHTMLAttributes<HTMLImageElement>)} />;
  },
}));

// Track router.push calls
const mockPush = vi.fn();
vi.mock("next/navigation", async () => {
  return {
    useRouter: () => ({
      push: mockPush,
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    }),
    usePathname: () => "/leaderboard",
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
  };
});

// ── Helpers ────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<{
  rank: number;
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  agent_name: string | null;
  is_available: boolean;
  completed_gigs: number;
  avg_rating: number;
  review_count: number;
  endorsements: number;
}> = {}) {
  return {
    rank: 1,
    id: "agent-1",
    username: "testbot",
    full_name: "Test Bot",
    avatar_url: null,
    agent_name: "TestAgent",
    is_available: true,
    completed_gigs: 10,
    avg_rating: 4.5,
    review_count: 8,
    endorsements: 5,
    ...overrides,
  };
}

function mockFetchResponse(data: unknown[], period = "all", sort = "gigs") {
  return {
    ok: true,
    json: async () => ({ data, period, sort }),
  } as Response;
}

function mockFetchError(message: string) {
  return {
    ok: false,
    json: async () => ({ error: message }),
  } as Response;
}

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

// ════════════════════════════════════════════════════════════════════
//  LeaderboardTable
// ════════════════════════════════════════════════════════════════════

describe("LeaderboardTable", () => {
  // ── Loading state ──────────────────────────────────────────────

  it("renders loading state initially", () => {
    // Never resolve the fetch
    vi.spyOn(global, "fetch").mockImplementation(
      () => new Promise(() => {})
    );

    render(<LeaderboardTable initialPeriod="all" initialSort="gigs" />);

    // The Loader2 spinner is inside an svg with animate-spin class
    const spinner = document.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  // ── Renders agent rows ─────────────────────────────────────────

  it("renders agent rows after loading", async () => {
    const entries = [
      makeEntry({ rank: 1, id: "a1", username: "alpha", full_name: "Alpha Bot", completed_gigs: 20 }),
      makeEntry({ rank: 2, id: "a2", username: "beta", full_name: "Beta Bot", completed_gigs: 15 }),
    ];

    vi.spyOn(global, "fetch").mockResolvedValue(mockFetchResponse(entries));

    render(<LeaderboardTable initialPeriod="all" initialSort="gigs" />);

    await waitFor(() => {
      expect(screen.getAllByText("Alpha Bot").length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText("Beta Bot").length).toBeGreaterThan(0);
    expect(screen.getAllByText("@alpha").length).toBeGreaterThan(0);
    expect(screen.getAllByText("@beta").length).toBeGreaterThan(0);
  });

  // ── Medals for top 3 ──────────────────────────────────────────

  it("renders medals for top 3 ranks", async () => {
    const entries = [
      makeEntry({ rank: 1, id: "a1", username: "first", full_name: "First" }),
      makeEntry({ rank: 2, id: "a2", username: "second", full_name: "Second" }),
      makeEntry({ rank: 3, id: "a3", username: "third", full_name: "Third" }),
      makeEntry({ rank: 4, id: "a4", username: "fourth", full_name: "Fourth" }),
    ];

    vi.spyOn(global, "fetch").mockResolvedValue(mockFetchResponse(entries));

    render(<LeaderboardTable initialPeriod="all" initialSort="gigs" />);

    await waitFor(() => {
      expect(screen.getAllByText("First").length).toBeGreaterThan(0);
    });

    // Medals via title attributes
    expect(screen.getAllByTitle("1st Place").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("2nd Place").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("3rd Place").length).toBeGreaterThan(0);

    // Rank 4 should show as plain number, not a medal
    const rank4Elements = screen.getAllByText("4");
    expect(rank4Elements.length).toBeGreaterThan(0);
  });

  // ── Period tabs ────────────────────────────────────────────────

  it("period tabs switch correctly", async () => {
    const user = userEvent.setup();
    const entries = [makeEntry()];

    vi.spyOn(global, "fetch").mockResolvedValue(mockFetchResponse(entries));

    render(<LeaderboardTable initialPeriod="all" initialSort="gigs" />);

    await waitFor(() => {
      expect(screen.getAllByText("Test Bot").length).toBeGreaterThan(0);
    });

    // Click "This Week" tab
    const weekTab = screen.getByText("This Week");
    await user.click(weekTab);

    // Should have called fetch with period=week
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("period=week")
    );

    // Router should be updated
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("period=week"),
      expect.anything()
    );
  });

  it("month period tab works", async () => {
    const user = userEvent.setup();
    const entries = [makeEntry()];

    vi.spyOn(global, "fetch").mockResolvedValue(mockFetchResponse(entries));

    render(<LeaderboardTable initialPeriod="all" initialSort="gigs" />);

    await waitFor(() => {
      expect(screen.getAllByText("Test Bot").length).toBeGreaterThan(0);
    });

    const monthTab = screen.getByText("This Month");
    await user.click(monthTab);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("period=month")
    );
  });

  // ── Sort buttons ───────────────────────────────────────────────

  it("sort buttons work", async () => {
    const user = userEvent.setup();
    const entries = [makeEntry()];

    vi.spyOn(global, "fetch").mockResolvedValue(mockFetchResponse(entries));

    render(<LeaderboardTable initialPeriod="all" initialSort="gigs" />);

    await waitFor(() => {
      expect(screen.getAllByText("Test Bot").length).toBeGreaterThan(0);
    });

    // Click "Avg Rating" sort button (use getByRole to avoid matching table header)
    const ratingBtn = screen.getByRole("button", { name: /Avg Rating/i });
    await user.click(ratingBtn);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("sort=rating")
    );
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("sort=rating"),
      expect.anything()
    );
  });

  it("endorsements sort button works", async () => {
    const user = userEvent.setup();
    const entries = [makeEntry()];

    vi.spyOn(global, "fetch").mockResolvedValue(mockFetchResponse(entries));

    render(<LeaderboardTable initialPeriod="all" initialSort="gigs" />);

    await waitFor(() => {
      expect(screen.getAllByText("Test Bot").length).toBeGreaterThan(0);
    });

    const endorseBtn = screen.getByRole("button", { name: /Endorsements/i });
    await user.click(endorseBtn);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("sort=endorsements")
    );
  });

  // ── Empty state ────────────────────────────────────────────────

  it("displays empty state when no agents", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(mockFetchResponse([]));

    render(<LeaderboardTable initialPeriod="all" initialSort="gigs" />);

    await waitFor(() => {
      expect(
        screen.getByText("No agents found for this time period.")
      ).toBeInTheDocument();
    });
  });

  // ── Error state ────────────────────────────────────────────────

  it("displays error state on fetch failure", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(mockFetchError("Server error"));

    render(<LeaderboardTable initialPeriod="all" initialSort="gigs" />);

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });

    expect(screen.getByText("Try Again")).toBeInTheDocument();
  });

  it("retries on Try Again click", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(global, "fetch");

    // First call fails, second succeeds
    fetchSpy
      .mockResolvedValueOnce(mockFetchError("Server error"))
      .mockResolvedValueOnce(mockFetchResponse([makeEntry()]));

    render(<LeaderboardTable initialPeriod="all" initialSort="gigs" />);

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Try Again"));

    await waitFor(() => {
      expect(screen.getAllByText("Test Bot").length).toBeGreaterThan(0);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  // ── Initial props respected ────────────────────────────────────

  it("uses initialPeriod and initialSort for first fetch", () => {
    vi.spyOn(global, "fetch").mockResolvedValue(mockFetchResponse([]));

    render(<LeaderboardTable initialPeriod="week" initialSort="rating" />);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("period=week")
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("sort=rating")
    );
  });
});
