import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ActivityFeed } from "./ActivityFeed";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockActivities = [
  {
    id: "act-1",
    user_id: "user-1",
    activity_type: "gig_posted",
    reference_id: "gig-1",
    reference_type: "gig",
    metadata: { gig_title: "Build a Website", category: "Development" },
    is_public: true,
    created_at: new Date().toISOString(),
    user: {
      id: "user-1",
      username: "testuser",
      full_name: "Test User",
      avatar_url: null,
    },
  },
  {
    id: "act-2",
    user_id: "user-1",
    activity_type: "review_received",
    reference_id: "review-1",
    reference_type: "review",
    metadata: {
      gig_title: "Old Project",
      rating: 5,
      reviewer_name: "Alice",
      gig_id: "gig-old",
    },
    is_public: true,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    user: {
      id: "user-1",
      username: "testuser",
      full_name: "Test User",
      avatar_url: null,
    },
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ActivityFeed", () => {
  it("renders loading skeletons initially", () => {
    // Return a never-resolving promise to keep loading state
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<ActivityFeed username="testuser" />);
    // Skeleton elements should be present
    const container = document.querySelector(".space-y-3");
    expect(container).toBeInTheDocument();
  });

  it("renders activities after loading", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: mockActivities,
          pagination: { total: 2, limit: 20, offset: 0 },
        }),
    });

    render(<ActivityFeed username="testuser" />);

    await waitFor(() => {
      expect(screen.getByText(/posted a new gig: Build a Website/)).toBeInTheDocument();
    });

    expect(screen.getByText(/received a ★★★★★ review from Alice/)).toBeInTheDocument();
  });

  it("shows empty state when no activities", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [],
          pagination: { total: 0, limit: 20, offset: 0 },
        }),
    });

    render(<ActivityFeed username="testuser" />);

    await waitFor(() => {
      expect(screen.getByText("No activity yet.")).toBeInTheDocument();
    });
  });

  it("shows error state on failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "User not found" }),
    });

    render(<ActivityFeed username="nonexistent" />);

    await waitFor(() => {
      expect(screen.getByText("User not found")).toBeInTheDocument();
    });
  });

  it("fetches from correct URL for user activity", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [],
          pagination: { total: 0, limit: 20, offset: 0 },
        }),
    });

    render(<ActivityFeed username="testuser" />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/users/testuser/activity?limit=20&offset=0"
      );
    });
  });

  it("fetches from own feed URL when ownFeed is true", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [],
          pagination: { total: 0, limit: 20, offset: 0 },
        }),
    });

    render(<ActivityFeed ownFeed />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/activity?limit=20&offset=0"
      );
    });
  });

  it("shows Load More button when there are more activities", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: mockActivities,
          pagination: { total: 50, limit: 20, offset: 0 },
        }),
    });

    render(<ActivityFeed username="testuser" />);

    await waitFor(() => {
      expect(screen.getByText(/Load More/)).toBeInTheDocument();
    });
  });

  it("does not show Load More when all activities loaded", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: mockActivities,
          pagination: { total: 2, limit: 20, offset: 0 },
        }),
    });

    render(<ActivityFeed username="testuser" />);

    await waitFor(() => {
      expect(screen.getByText(/posted a new gig/)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Load More/)).not.toBeInTheDocument();
  });
});
