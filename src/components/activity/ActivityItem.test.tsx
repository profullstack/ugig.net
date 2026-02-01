import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityItem } from "./ActivityItem";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const baseActivity = {
  id: "act-123",
  activity_type: "gig_posted",
  reference_id: "gig-456",
  reference_type: "gig",
  metadata: { gig_title: "Build a React App", category: "Development" } as Record<string, unknown>,
  is_public: true,
  created_at: new Date().toISOString(),
  user: {
    id: "user-789",
    username: "testuser",
    full_name: "Test User",
    avatar_url: null,
  },
};

describe("ActivityItem", () => {
  it("renders gig_posted activity with title", () => {
    render(<ActivityItem activity={baseActivity} />);
    expect(screen.getByText(/posted a new gig: Build a React App/)).toBeInTheDocument();
  });

  it("renders gig_applied activity", () => {
    const activity = {
      ...baseActivity,
      activity_type: "gig_applied",
      metadata: { gig_title: "Fix a Bug", category: "Development" } as Record<string, unknown>,
    };
    render(<ActivityItem activity={activity} />);
    expect(screen.getByText(/applied to a gig: Fix a Bug/)).toBeInTheDocument();
  });

  it("renders gig_completed activity", () => {
    const activity = {
      ...baseActivity,
      activity_type: "gig_completed",
      metadata: { gig_title: "Design Logo", category: "Design" } as Record<string, unknown>,
    };
    render(<ActivityItem activity={activity} />);
    expect(screen.getByText(/completed a gig: Design Logo/)).toBeInTheDocument();
  });

  it("renders review_given activity", () => {
    const activity = {
      ...baseActivity,
      activity_type: "review_given",
      reference_id: "review-123",
      reference_type: "review",
      metadata: {
        gig_title: "Build App",
        rating: 5,
        reviewee_name: "Jane Doe",
        gig_id: "gig-456",
      } as Record<string, unknown>,
    };
    render(<ActivityItem activity={activity} />);
    expect(screen.getByText(/left a ★★★★★ review for Jane Doe/)).toBeInTheDocument();
  });

  it("renders review_received activity", () => {
    const activity = {
      ...baseActivity,
      activity_type: "review_received",
      reference_id: "review-123",
      reference_type: "review",
      metadata: {
        gig_title: "Build App",
        rating: 4,
        reviewer_name: "John Smith",
        gig_id: "gig-456",
      } as Record<string, unknown>,
    };
    render(<ActivityItem activity={activity} />);
    expect(screen.getByText(/received a ★★★★ review from John Smith/)).toBeInTheDocument();
  });

  it("links gig activities to the gig page", () => {
    render(<ActivityItem activity={baseActivity} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/gigs/gig-456");
  });

  it("links review activities to the gig page via metadata", () => {
    const activity = {
      ...baseActivity,
      activity_type: "review_given",
      reference_id: "review-123",
      reference_type: "review",
      metadata: {
        gig_title: "Build App",
        rating: 5,
        reviewee_name: "Jane",
        gig_id: "gig-999",
      } as Record<string, unknown>,
    };
    render(<ActivityItem activity={activity} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/gigs/gig-999");
  });

  it("shows user name when showUser is true", () => {
    render(<ActivityItem activity={baseActivity} showUser={true} />);
    expect(screen.getByText("Test User")).toBeInTheDocument();
  });

  it("does not show user name when showUser is false", () => {
    render(<ActivityItem activity={baseActivity} showUser={false} />);
    expect(screen.queryByText("Test User")).not.toBeInTheDocument();
  });

  it("shows relative time for recent activity", () => {
    const recentActivity = {
      ...baseActivity,
      created_at: new Date().toISOString(),
    };
    render(<ActivityItem activity={recentActivity} />);
    expect(screen.getByText("just now")).toBeInTheDocument();
  });

  it("handles unknown activity types gracefully", () => {
    const activity = {
      ...baseActivity,
      activity_type: "some_new_type",
      reference_id: null,
      reference_type: null,
      metadata: {} as Record<string, unknown>,
    };
    render(<ActivityItem activity={activity} />);
    expect(screen.getByText(/some new type/)).toBeInTheDocument();
  });
});
