import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectoryOwnerActions } from "./DirectoryOwnerActions";

const { push, refresh } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const listing = {
  id: "listing-1",
  title: "Example",
  url: "https://example.com",
  description: null,
  tags: [],
  logo_url: null,
  banner_url: null,
  screenshot_url: null,
  status: "active",
};

describe("DirectoryOwnerActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps the listing in place when a visibility update fails", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Visibility denied" }), { status: 403 })
    );

    render(<DirectoryOwnerActions listing={listing} />);
    await userEvent.click(screen.getByRole("button", { name: "Hide" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Visibility denied");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps the listing in place when deletion fails", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Delete denied" }), { status: 403 })
    );

    render(<DirectoryOwnerActions listing={listing} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Delete denied");
    expect(push).not.toHaveBeenCalled();
  });

  it("re-enables saving when an edit request fails at the network layer", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));

    render(<DirectoryOwnerActions listing={listing} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Update failed");
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
