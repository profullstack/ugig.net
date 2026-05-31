import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectoryVoteButton } from "@/components/directory/DirectoryVoteButton";
import { McpVoteButton } from "@/components/mcp/McpVoteButton";
import { PromptVoteButton } from "@/components/prompts/PromptVoteButton";
import { SkillVoteButton } from "@/components/skills/SkillVoteButton";

const forms = [
  {
    name: "directory",
    render: () => (
      <DirectoryVoteButton
        listingId="listing-1"
        initialUpvotes={0}
        initialDownvotes={0}
        initialScore={0}
        initialUserVote={null}
      />
    ),
  },
  {
    name: "MCP",
    render: () => (
      <McpVoteButton
        slug="listing-1"
        initialUpvotes={0}
        initialDownvotes={0}
        initialScore={0}
        initialUserVote={null}
      />
    ),
  },
  {
    name: "prompt",
    render: () => (
      <PromptVoteButton
        slug="listing-1"
        initialUpvotes={0}
        initialDownvotes={0}
        initialScore={0}
        initialUserVote={null}
      />
    ),
  },
  {
    name: "skill",
    render: () => (
      <SkillVoteButton
        slug="listing-1"
        initialUpvotes={0}
        initialDownvotes={0}
        initialScore={0}
        initialUserVote={null}
      />
    ),
  },
];

describe("marketplace vote errors", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each(forms)("shows API errors when the $name vote request fails", async ({ render: renderForm }) => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Vote denied" }), { status: 403 })
    );

    render(renderForm());
    await userEvent.click(screen.getByTitle("Upvote"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Vote denied");
    expect(screen.getByTitle("Upvote")).toBeEnabled();
  });

  it("shows a fallback error when a vote request fails at the network layer", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));

    render(forms[0].render());
    await userEvent.click(screen.getByTitle("Upvote"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to update vote");
    expect(screen.getByTitle("Upvote")).toBeEnabled();
  });
});
