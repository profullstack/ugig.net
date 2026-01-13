import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ConversationList } from "./ConversationList";

const mockConversations = [
  {
    id: "conv-1",
    participant_ids: ["user-1", "user-2"],
    gig_id: "gig-1",
    last_message_at: "2024-01-15T10:00:00Z",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-15T10:00:00Z",
    participants: [
      {
        id: "user-1",
        username: "currentuser",
        full_name: "Current User",
        avatar_url: null,
      },
      {
        id: "user-2",
        username: "otheruser",
        full_name: "Other User",
        avatar_url: "https://example.com/avatar.jpg",
      },
    ],
    gig: {
      id: "gig-1",
      title: "React Developer Needed",
    },
    last_message: {
      content: "Looking forward to hearing from you!",
      sender_id: "user-2",
      created_at: "2024-01-15T10:00:00Z",
    },
    unread_count: 2,
  },
  {
    id: "conv-2",
    participant_ids: ["user-1", "user-3"],
    gig_id: "gig-2",
    last_message_at: "2024-01-14T15:00:00Z",
    created_at: "2024-01-10T00:00:00Z",
    updated_at: "2024-01-14T15:00:00Z",
    participants: [
      {
        id: "user-1",
        username: "currentuser",
        full_name: "Current User",
        avatar_url: null,
      },
      {
        id: "user-3",
        username: "thirduser",
        full_name: null,
        avatar_url: null,
      },
    ],
    gig: {
      id: "gig-2",
      title: "UI/UX Designer",
    },
    last_message: {
      content: "Thanks for applying!",
      sender_id: "user-1",
      created_at: "2024-01-14T15:00:00Z",
    },
    unread_count: 0,
  },
];

describe("ConversationList", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockClear();
  });

  it("shows loading state initially", () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });

    render(<ConversationList currentUserId="user-1" />);
    // Should show skeleton loading state
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders empty state when no conversations", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });

    render(<ConversationList currentUserId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText("No conversations yet")).toBeInTheDocument();
    });
  });

  it("renders conversations list", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockConversations }),
    });

    render(<ConversationList currentUserId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText("Other User")).toBeInTheDocument();
      expect(screen.getByText("thirduser")).toBeInTheDocument();
    });
  });

  it("shows gig title for each conversation", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockConversations }),
    });

    render(<ConversationList currentUserId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText("React Developer Needed")).toBeInTheDocument();
      expect(screen.getByText("UI/UX Designer")).toBeInTheDocument();
    });
  });

  it("shows last message preview", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockConversations }),
    });

    render(<ConversationList currentUserId="user-1" />);

    await waitFor(() => {
      expect(
        screen.getByText("Looking forward to hearing from you!")
      ).toBeInTheDocument();
    });
  });

  it("prefixes own messages with 'You:'", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockConversations }),
    });

    render(<ConversationList currentUserId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText(/You: Thanks for applying!/)).toBeInTheDocument();
    });
  });

  it("shows unread count badge when there are unread messages", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockConversations }),
    });

    render(<ConversationList currentUserId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText("2")).toBeInTheDocument();
    });
  });

  it("does not show unread badge when count is 0", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: mockConversations.map((c) => ({ ...c, unread_count: 0 })),
        }),
    });

    render(<ConversationList currentUserId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText("Other User")).toBeInTheDocument();
    });

    // Should not have any badge elements
    expect(screen.queryByText("2")).not.toBeInTheDocument();
  });

  it("shows error message when API fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Failed to load conversations" }),
    });

    render(<ConversationList currentUserId="user-1" />);

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load conversations")
      ).toBeInTheDocument();
    });
  });

  it("links to conversation pages", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockConversations }),
    });

    render(<ConversationList currentUserId="user-1" />);

    await waitFor(() => {
      const links = screen.getAllByRole("link");
      expect(links[0]).toHaveAttribute("href", "/dashboard/messages/conv-1");
      expect(links[1]).toHaveAttribute("href", "/dashboard/messages/conv-2");
    });
  });

  it("displays other participant avatar with initials when no avatar_url", async () => {
    // Create conversations where participants have no avatar_url
    const conversationsWithoutAvatars = mockConversations.map((conv) => ({
      ...conv,
      participants: conv.participants.map((p) => ({
        ...p,
        avatar_url: null,
      })),
    }));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: conversationsWithoutAvatars }),
    });

    render(<ConversationList currentUserId="user-1" />);

    await waitFor(() => {
      // "O" for "Other User" and "T" for "thirduser"
      expect(screen.getByText("O")).toBeInTheDocument();
      expect(screen.getByText("T")).toBeInTheDocument();
    });
  });
});
