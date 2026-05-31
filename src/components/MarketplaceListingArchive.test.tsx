import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpListingForm } from "@/components/mcp/McpListingForm";
import { PromptListingForm } from "@/components/prompts/PromptListingForm";
import { SkillListingForm } from "@/components/skills/SkillListingForm";

const { confirm, push, refresh } = vi.hoisted(() => ({
  confirm: vi.fn(() => Promise.resolve(true)),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/components/providers/DialogProvider", () => ({
  useDialog: () => ({ confirm }),
}));

const forms = [
  { name: "skill", component: SkillListingForm },
  { name: "MCP", component: McpListingForm },
  { name: "prompt", component: PromptListingForm },
];

describe("marketplace listing archive errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each(forms)("shows API errors when the $name archive request fails", async ({ component: Form }) => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Archive denied" }), { status: 403 })
    );

    render(<Form slug="listing-1" />);
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));

    expect(await screen.findByText("Archive denied")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
