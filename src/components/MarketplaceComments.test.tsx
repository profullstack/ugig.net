import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectoryComments } from "@/components/directory/DirectoryComments";
import { McpComments } from "@/components/mcp/McpComments";
import { PromptComments } from "@/components/prompts/PromptComments";
import { SkillComments } from "@/components/skills/SkillComments";

const surfaces = [
  {
    name: "directory",
    render: () => <DirectoryComments listingId="listing-1" isAuthenticated={false} />,
  },
  {
    name: "MCP",
    render: () => <McpComments slug="listing-1" isAuthenticated={false} />,
  },
  {
    name: "prompt",
    render: () => <PromptComments slug="listing-1" isAuthenticated={false} />,
  },
  {
    name: "skill",
    render: () => <SkillComments slug="listing-1" isAuthenticated={false} />,
  },
];

describe("marketplace comment loading errors", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each(surfaces)("does not report an empty $name thread when loading fails", async ({ render: renderSurface }) => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Comments unavailable" }), { status: 503 })
    );

    render(renderSurface());

    expect(await screen.findByRole("alert")).toHaveTextContent("Comments unavailable");
    expect(
      screen.queryByText("No comments yet. Be the first to share your thoughts!")
    ).not.toBeInTheDocument();
  });
});
