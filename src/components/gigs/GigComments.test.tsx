import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GigComments } from "@/components/gigs/GigComments";

vi.mock("@/components/providers/DialogProvider", () => ({
  useDialog: () => ({ confirm: vi.fn().mockResolvedValue(true) }),
}));

const thread = {
  id: "comment-1",
  gig_id: "gig-1",
  author_id: "author-1",
  parent_id: null,
  content: "Is this still open?",
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  author: {
    id: "author-1",
    username: "asker",
    full_name: "Ada Asker",
    avatar_url: null,
  },
  replies: [
    {
      id: "comment-2",
      gig_id: "gig-1",
      author_id: "owner-1",
      parent_id: "comment-1",
      content: "Yes it is.",
      created_at: "2026-08-02T00:00:00.000Z",
      updated_at: "2026-08-02T00:00:00.000Z",
      author: {
        id: "owner-1",
        username: "poster",
        full_name: null,
        avatar_url: null,
      },
    },
  ],
};

describe("gig comment authors", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("links each comment author to their profile", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ comments: [thread], total: 2 }), { status: 200 })
    );

    render(<GigComments gigId="gig-1" gigOwnerId="owner-1" />);

    // Both the avatar and the name link, so there are two per author.
    const topLevel = await screen.findAllByRole("link", { name: "Ada Asker" });
    expect(topLevel).toHaveLength(2);
    for (const link of topLevel) {
      expect(link).toHaveAttribute("href", "/u/asker");
    }

    // Replies get a link too, and fall back to the username when there is no full name.
    for (const link of screen.getAllByRole("link", { name: "poster" })) {
      expect(link).toHaveAttribute("href", "/u/poster");
    }
  });

  it("renders plain text when the author has no username", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          comments: [
            {
              ...thread,
              replies: [],
              author: { id: "author-1", username: null, full_name: null, avatar_url: null },
            },
          ],
          total: 1,
        }),
        { status: 200 }
      )
    );

    render(<GigComments gigId="gig-1" gigOwnerId="owner-1" />);

    expect(await screen.findByText("Unknown")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Unknown" })).toBeNull();
  });
});
