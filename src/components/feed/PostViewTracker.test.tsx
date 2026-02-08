import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { PostViewTracker } from "./PostViewTracker";

// ── Mocks ──────────────────────────────────────────────────────────

const mockFetch = vi.fn().mockResolvedValue({ ok: true });

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = mockFetch;
  sessionStorage.clear();
});

// ════════════════════════════════════════════════════════════════════
//  PostViewTracker
// ════════════════════════════════════════════════════════════════════

describe("PostViewTracker", () => {
  it("calls the view API on mount", async () => {
    render(<PostViewTracker postId="post-1" />);

    // Wait for the useEffect to fire
    await new Promise((r) => setTimeout(r, 10));

    expect(mockFetch).toHaveBeenCalledWith("/api/posts/post-1/view", { method: "POST" });
  });

  it("renders nothing (returns null)", () => {
    const { container } = render(<PostViewTracker postId="post-1" />);
    expect(container.innerHTML).toBe("");
  });

  it("deduplicates by sessionStorage — does not call twice for same post", async () => {
    const { unmount } = render(<PostViewTracker postId="post-1" />);
    await new Promise((r) => setTimeout(r, 10));
    expect(mockFetch).toHaveBeenCalledTimes(1);
    unmount();

    // Re-render same post
    render(<PostViewTracker postId="post-1" />);
    await new Promise((r) => setTimeout(r, 10));
    expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1 — deduped
  });

  it("tracks different posts independently", async () => {
    const { unmount } = render(<PostViewTracker postId="post-1" />);
    await new Promise((r) => setTimeout(r, 10));
    unmount();

    render(<PostViewTracker postId="post-2" />);
    await new Promise((r) => setTimeout(r, 10));

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenCalledWith("/api/posts/post-1/view", { method: "POST" });
    expect(mockFetch).toHaveBeenCalledWith("/api/posts/post-2/view", { method: "POST" });
  });

  it("sets sessionStorage key on view", async () => {
    render(<PostViewTracker postId="post-1" />);
    await new Promise((r) => setTimeout(r, 10));

    expect(sessionStorage.getItem("viewed_post_post-1")).toBe("1");
  });
});
