import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PostWithAuthor } from "@/types";
import { PostCard } from "./PostCard";

const { pollDisplay } = vi.hoisted(() => ({
  pollDisplay: vi.fn(() => null),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("./PollDisplay", () => ({
  PollDisplay: pollDisplay,
}));

vi.mock("./VoteButtons", () => ({
  VoteButtons: () => null,
}));

vi.mock("@/components/zaps/ZapButton", () => ({
  ZapButton: () => null,
}));

vi.mock("@/components/ui/MarkdownContent", () => ({
  MarkdownContent: () => null,
}));

const pollPost = {
  id: "post-1",
  author: null,
  author_id: null,
  comments_count: 0,
  content: "Pick one",
  created_at: "2026-05-31T00:00:00.000Z",
  post_type: "poll",
  score: 0,
  tags: [],
  updated_at: "2026-05-31T00:00:00.000Z",
  url: null,
  views_count: 0,
} as unknown as PostWithAuthor;

describe("PostCard poll login state", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders read-only poll results for anonymous viewers", () => {
    render(<PostCard post={pollPost} />);

    expect(pollDisplay).toHaveBeenCalledWith(
      expect.objectContaining({ postId: "post-1", isLoggedIn: false }),
      undefined
    );
  });

  it("allows authenticated viewers to vote", () => {
    render(<PostCard post={pollPost} currentUserId="user-1" />);

    expect(pollDisplay).toHaveBeenCalledWith(
      expect.objectContaining({ postId: "post-1", isLoggedIn: true }),
      undefined
    );
  });
});
