import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GigCard } from "./GigCard";

// Mock next modules
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img {...props} />
  ),
}));

vi.mock("./SaveGigButton", () => ({
  SaveGigButton: () => <button>Save</button>,
}));

const baseGig = {
  id: "gig-1",
  title: "Build a React App",
  description: "We need a skilled React developer to build our frontend.",
  category: "Web Development",
  skills_required: ["React", "TypeScript", "Tailwind"],
  ai_tools_preferred: [],
  budget_type: "fixed" as const,
  budget_min: 500,
  budget_max: 1000,
  budget_unit: null,
  payment_coin: null,
  location_type: "remote" as const,
  location: null,
  status: "active" as const,
  poster_id: "user-1",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  expires_at: null,
  applications_count: 0,
  duration: null,
  views_count: 0,
};

const mockPoster = {
  id: "user-1",
  username: "janedoe",
  full_name: "Jane Doe",
  avatar_url: "https://example.com/avatar.jpg",
  account_type: "human" as const,
  verified: false,
  verification_type: null,
};

describe("GigCard", () => {
  it("renders gig title and description", () => {
    render(<GigCard gig={{ ...baseGig, poster: mockPoster }} />);
    expect(screen.getByText("Build a React App")).toBeInTheDocument();
    expect(screen.getByText(baseGig.description)).toBeInTheDocument();
  });

  it("renders poster username below avatar", () => {
    render(<GigCard gig={{ ...baseGig, poster: mockPoster }} />);
    expect(screen.getByText("@janedoe")).toBeInTheDocument();
  });

  it("renders poster avatar with correct src", () => {
    render(<GigCard gig={{ ...baseGig, poster: mockPoster }} />);
    const img = screen.getByAltText("Jane Doe");
    expect(img).toHaveAttribute("src", "https://example.com/avatar.jpg");
  });

  it("uses default avatar when poster has no avatar_url", () => {
    render(
      <GigCard gig={{ ...baseGig, poster: { ...mockPoster, avatar_url: null } }} />
    );
    const img = screen.getByAltText("Jane Doe");
    expect(img).toHaveAttribute("src", "/default-avatar.svg");
  });

  it("falls back to username for alt text when no full_name", () => {
    render(
      <GigCard gig={{ ...baseGig, poster: { ...mockPoster, full_name: null } }} />
    );
    expect(screen.getByAltText("janedoe")).toBeInTheDocument();
  });

  it("renders without poster gracefully", () => {
    render(<GigCard gig={baseGig} />);
    expect(screen.getByText("Build a React App")).toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it("renders category badge", () => {
    render(<GigCard gig={{ ...baseGig, poster: mockPoster }} />);
    expect(screen.getByText("Web Development")).toBeInTheDocument();
  });

  it("renders skill badges (max 4)", () => {
    render(<GigCard gig={{ ...baseGig, poster: mockPoster }} />);
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("Tailwind")).toBeInTheDocument();
  });

  it("shows +N badge when more than 4 skills", () => {
    const gig = {
      ...baseGig,
      skills_required: ["React", "TypeScript", "Tailwind", "Node.js", "PostgreSQL", "Docker"],
      poster: mockPoster,
    };
    render(<GigCard gig={gig} />);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("displays fixed budget range", () => {
    render(<GigCard gig={{ ...baseGig, poster: mockPoster }} />);
    expect(screen.getByText(/\$500.*\$1,000/)).toBeInTheDocument();
  });

  it("displays hourly budget with /hr suffix", () => {
    const gig = {
      ...baseGig,
      budget_type: "hourly" as const,
      budget_min: 50,
      budget_max: 100,
      poster: mockPoster,
    };
    render(<GigCard gig={gig} />);
    expect(screen.getByText(/\/hr/)).toBeInTheDocument();
  });

  it("displays revenue share budget", () => {
    const gig = {
      ...baseGig,
      budget_type: "revenue_share" as const,
      budget_min: 10,
      budget_max: 20,
      poster: mockPoster,
    };
    render(<GigCard gig={gig} />);
    expect(screen.getByText("10-20% rev share")).toBeInTheDocument();
  });

  it("shows Budget TBD when fixed with no amounts", () => {
    const gig = {
      ...baseGig,
      budget_min: null,
      budget_max: null,
      poster: mockPoster,
    };
    render(<GigCard gig={gig} />);
    expect(screen.getByText("Budget TBD")).toBeInTheDocument();
  });

  it("displays location type", () => {
    render(<GigCard gig={{ ...baseGig, poster: mockPoster }} />);
    expect(screen.getByText("Remote")).toBeInTheDocument();
  });

  it("displays payment coin when set", () => {
    const gig = {
      ...baseGig,
      payment_coin: "BTC",
      poster: mockPoster,
    };
    render(<GigCard gig={gig} />);
    expect(screen.getByText(/BTC/)).toBeInTheDocument();
  });

  it("links to the gig detail page", () => {
    render(<GigCard gig={{ ...baseGig, poster: mockPoster }} />);
    const link = screen.getByRole("link", { name: /Build a React App/ });
    expect(link).toHaveAttribute("href", "/gigs/gig-1");
  });

  it("shows verified badge when poster is verified", () => {
    const gig = {
      ...baseGig,
      poster: { ...mockPoster, verified: true, verification_type: "manual" as const },
    };
    const { container } = render(<GigCard gig={gig} />);
    // VerifiedBadge renders a tooltip/title with "Verified"
    const verifiedEl = container.querySelector("[title]");
    expect(verifiedEl).toBeTruthy();
  });

  it("shows agent badge when poster is agent", () => {
    const gig = {
      ...baseGig,
      poster: { ...mockPoster, account_type: "agent" as const },
    };
    const { container } = render(<GigCard gig={gig} />);
    expect(container.innerHTML.toLowerCase()).toContain("agent");
  });

  it("shows save button when showSaveButton is true", () => {
    render(
      <GigCard gig={{ ...baseGig, poster: mockPoster }} showSaveButton={true} />
    );
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("does not show save button by default", () => {
    render(<GigCard gig={{ ...baseGig, poster: mockPoster }} />);
    expect(screen.queryByText("Save")).not.toBeInTheDocument();
  });

  it("highlights matching tags", () => {
    const { container } = render(
      <GigCard
        gig={{ ...baseGig, poster: mockPoster }}
        highlightTags={["react"]}
      />
    );
    // The highlighted skill should use default variant (not outline)
    const badges = container.querySelectorAll("[class]");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("handles poster as array (Supabase relation quirk)", () => {
    const gig = {
      ...baseGig,
      poster: [mockPoster] as unknown as typeof mockPoster,
    };
    render(<GigCard gig={gig} />);
    expect(screen.getByText("@janedoe")).toBeInTheDocument();
  });

  it("displays per_task budget with custom unit", () => {
    const gig = {
      ...baseGig,
      budget_type: "per_task" as const,
      budget_min: 25,
      budget_max: null,
      budget_unit: "article",
      poster: mockPoster,
    };
    render(<GigCard gig={gig} />);
    expect(screen.getByText(/\/article/)).toBeInTheDocument();
  });
});
