import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NotificationBell } from "./NotificationBell";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href, onClick }: { children: React.ReactNode; href: string; onClick?: () => void }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));

// Mock the API
vi.mock("@/lib/api", () => ({
  notifications: {
    list: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

import { notifications as notificationsApi } from "@/lib/api";

const mockNotifications = [
  {
    id: "notif-1",
    user_id: "user-123",
    type: "new_message",
    title: "New Message",
    message: "John sent you a message",
    data: { conversation_id: "conv-123" },
    read_at: null,
    created_at: "2024-01-15T10:30:00Z",
  },
  {
    id: "notif-2",
    user_id: "user-123",
    type: "new_application",
    title: "New Application",
    message: "Someone applied to your gig",
    data: { gig_id: "gig-123" },
    read_at: "2024-01-14T09:00:00Z",
    created_at: "2024-01-14T09:00:00Z",
  },
];

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(notificationsApi.list).mockResolvedValue({
      data: {
        notifications: mockNotifications,
        unread_count: 1,
      },
      error: null,
    });
  });

  it("renders bell icon", async () => {
    render(<NotificationBell />);

    await waitFor(() => {
      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
    });
  });

  it("shows unread count badge when there are unread notifications", async () => {
    render(<NotificationBell />);

    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument();
    });
  });

  it("hides badge when there are no unread notifications", async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue({
      data: {
        notifications: mockNotifications.map((n) => ({ ...n, read_at: "2024-01-15T12:00:00Z" })),
        unread_count: 0,
      },
      error: null,
    });

    render(<NotificationBell />);

    await waitFor(() => {
      expect(screen.queryByText("1")).not.toBeInTheDocument();
    });
  });

  it("opens dropdown when clicked", async () => {
    render(<NotificationBell />);

    await waitFor(() => {
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(screen.getByText("Notifications")).toBeInTheDocument();
  });

  it("displays notifications in dropdown", async () => {
    render(<NotificationBell />);

    await waitFor(() => {
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(screen.getByText("New Message")).toBeInTheDocument();
    expect(screen.getByText("New Application")).toBeInTheDocument();
  });

  it("shows 'Mark all read' button when there are unread notifications", async () => {
    render(<NotificationBell />);

    await waitFor(() => {
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(screen.getByText("Mark all read")).toBeInTheDocument();
  });

  it("calls markAllRead when 'Mark all read' is clicked", async () => {
    vi.mocked(notificationsApi.markAllRead).mockResolvedValue({ data: {}, error: null });

    render(<NotificationBell />);

    await waitFor(() => {
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("Mark all read"));

    await waitFor(() => {
      expect(notificationsApi.markAllRead).toHaveBeenCalled();
    });
  });

  it("shows 'No notifications yet' when empty", async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue({
      data: {
        notifications: [],
        unread_count: 0,
      },
      error: null,
    });

    render(<NotificationBell />);

    await waitFor(() => {
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText("No notifications yet")).toBeInTheDocument();
  });

  it("shows loading state initially", async () => {
    // Make the API not resolve immediately
    vi.mocked(notificationsApi.list).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({
        data: { notifications: [], unread_count: 0 },
        error: null,
      }), 100))
    );

    render(<NotificationBell />);

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("marks notification as read when clicked", async () => {
    vi.mocked(notificationsApi.markRead).mockResolvedValue({ data: {}, error: null });

    render(<NotificationBell />);

    await waitFor(() => {
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByText("New Message")).toBeInTheDocument();
    });

    // Click on the unread notification
    const messageLink = screen.getByText("New Message").closest("a");
    if (messageLink) {
      fireEvent.click(messageLink);
    }

    await waitFor(() => {
      expect(notificationsApi.markRead).toHaveBeenCalledWith("notif-1");
    });
  });

  it("shows 'View all notifications' link", async () => {
    render(<NotificationBell />);

    await waitFor(() => {
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button"));

    const viewAllLink = screen.getByText("View all notifications");
    expect(viewAllLink).toBeInTheDocument();
    expect(viewAllLink.closest("a")).toHaveAttribute("href", "/dashboard/notifications");
  });

  it("shows 9+ when unread count exceeds 9", async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue({
      data: {
        notifications: mockNotifications,
        unread_count: 15,
      },
      error: null,
    });

    render(<NotificationBell />);

    await waitFor(() => {
      expect(screen.getByText("9+")).toBeInTheDocument();
    });
  });
});
