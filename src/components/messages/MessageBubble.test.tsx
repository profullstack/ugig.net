import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "./MessageBubble";
import type { MessageWithSender } from "@/types";

const mockMessage: MessageWithSender = {
  id: "msg-123",
  conversation_id: "conv-456",
  sender_id: "user-789",
  content: "Hello, this is a test message!",
  attachments: null,
  read_by: ["user-789"],
  created_at: "2024-01-15T10:30:00Z",
  sender: {
    id: "user-789",
    username: "testuser",
    full_name: "Test User",
    avatar_url: null,
    banner_url: null,
    bio: null,
    skills: [],
    ai_tools: [],
    hourly_rate: null,
    portfolio_urls: [],
    location: null,
    timezone: null,
    is_available: true,
    profile_completed: false,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    resume_url: null,
    resume_filename: null,
    website: null,
    linkedin_url: null,
    github_url: null,
    twitter_url: null,
    wallet_addresses: [],
    last_active_at: "2024-01-01T00:00:00Z",
    account_type: "human" as const,
    agent_name: null,
    agent_description: null,
    agent_version: null,
    agent_operator_url: null,
    agent_source_url: null,
    rate_type: null,
    rate_amount: null,
    rate_unit: null,
    preferred_coin: null,
    followers_count: 0,
    following_count: 0,
    reminder_sent_at: null,
  },
};

describe("MessageBubble", () => {
  it("renders message content", () => {
    render(<MessageBubble message={mockMessage} isOwn={false} />);
    expect(screen.getByText("Hello, this is a test message!")).toBeInTheDocument();
  });

  it("shows avatar with initials when no avatar_url", () => {
    render(<MessageBubble message={mockMessage} isOwn={false} />);
    expect(screen.getByText("T")).toBeInTheDocument();
  });

  it("uses username initial if no full_name", () => {
    const messageNoName = {
      ...mockMessage,
      sender: { ...mockMessage.sender, full_name: null },
    };
    render(<MessageBubble message={messageNoName} isOwn={false} />);
    expect(screen.getByText("T")).toBeInTheDocument();
  });

  it("applies own message styling when isOwn is true", () => {
    const { container } = render(
      <MessageBubble message={mockMessage} isOwn={true} />
    );
    const messageContainer = container.firstChild as HTMLElement;
    expect(messageContainer.className).toContain("ml-auto");
    expect(messageContainer.className).toContain("flex-row-reverse");
  });

  it("applies other message styling when isOwn is false", () => {
    const { container } = render(
      <MessageBubble message={mockMessage} isOwn={false} />
    );
    const messageContainer = container.firstChild as HTMLElement;
    expect(messageContainer.className).not.toContain("ml-auto");
  });

  it("hides avatar when showAvatar is false", () => {
    render(<MessageBubble message={mockMessage} isOwn={false} showAvatar={false} />);
    expect(screen.queryByText("T")).not.toBeInTheDocument();
  });

  it("shows avatar when showAvatar is true (default)", () => {
    render(<MessageBubble message={mockMessage} isOwn={false} />);
    expect(screen.getByText("T")).toBeInTheDocument();
  });

  it("renders multiline content correctly", () => {
    const multilineMessage = {
      ...mockMessage,
      content: "Line 1\nLine 2\nLine 3",
    };
    render(<MessageBubble message={multilineMessage} isOwn={false} />);
    // Use a function matcher to handle whitespace normalization
    expect(
      screen.getByText((content) => content.includes("Line 1") && content.includes("Line 2") && content.includes("Line 3"))
    ).toBeInTheDocument();
  });

  it("displays formatted time", () => {
    render(<MessageBubble message={mockMessage} isOwn={false} />);
    // The time should be rendered (format depends on locale)
    const timeElement = screen.getByText(/\d{1,2}:\d{2}/);
    expect(timeElement).toBeInTheDocument();
  });

  it("renders avatar image when avatar_url is provided", () => {
    const messageWithAvatar = {
      ...mockMessage,
      sender: {
        ...mockMessage.sender,
        avatar_url: "https://example.com/avatar.jpg",
      },
    };
    render(<MessageBubble message={messageWithAvatar} isOwn={false} />);
    const avatar = screen.getByRole("img");
    expect(avatar).toHaveAttribute("src", "https://example.com/avatar.jpg");
  });

  it("shows single check mark for unread own messages", () => {
    const { container } = render(
      <MessageBubble
        message={mockMessage}
        isOwn={true}
        otherParticipantId="other-user-123"
      />
    );
    // Should show single check (not read by other)
    expect(container.querySelector('[title="Sent"]')).toBeInTheDocument();
    expect(container.querySelector('[title="Read"]')).not.toBeInTheDocument();
  });

  it("shows double check mark for read own messages", () => {
    const readMessage = {
      ...mockMessage,
      read_by: ["user-789", "other-user-123"],
    };
    const { container } = render(
      <MessageBubble
        message={readMessage}
        isOwn={true}
        otherParticipantId="other-user-123"
      />
    );
    // Should show double check (read by other)
    expect(container.querySelector('[title="Read"]')).toBeInTheDocument();
    expect(container.querySelector('[title="Sent"]')).not.toBeInTheDocument();
  });

  it("does not show check marks for other people's messages", () => {
    const { container } = render(
      <MessageBubble
        message={mockMessage}
        isOwn={false}
        otherParticipantId="other-user-123"
      />
    );
    // Should not show any check marks
    expect(container.querySelector('[title="Sent"]')).not.toBeInTheDocument();
    expect(container.querySelector('[title="Read"]')).not.toBeInTheDocument();
  });
});
