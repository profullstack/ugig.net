"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Bell,
  MessageSquare,
  FileText,
  Briefcase,
  Star,
  DollarSign,
  Video,
  CheckCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { notifications } from "@/lib/api";
import { formatRelativeTime, cn } from "@/lib/utils";
import type { Database } from "@/types/database";

type Notification = Database["public"]["Tables"]["notifications"]["Row"];

const NOTIFICATION_ICONS: Record<string, React.ReactNode> = {
  new_application: <FileText className="h-4 w-4" />,
  application_shortlisted: <Briefcase className="h-4 w-4" />,
  application_accepted: <CheckCheck className="h-4 w-4" />,
  application_rejected: <FileText className="h-4 w-4" />,
  new_message: <MessageSquare className="h-4 w-4" />,
  call_scheduled: <Video className="h-4 w-4" />,
  new_review: <Star className="h-4 w-4" />,
  gig_update: <Briefcase className="h-4 w-4" />,
  payment_received: <DollarSign className="h-4 w-4" />,
};

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notificationList, setNotificationList] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchNotifications() {
      const result = await notifications.list({ limit: 10 });
      if (!result.error && result.data) {
        const data = result.data as {
          notifications: Notification[];
          unread_count: number;
        };
        setNotificationList(data.notifications || []);
        setUnreadCount(data.unread_count || 0);
      }
      setIsLoading(false);
    }
    fetchNotifications();

    // Polling for new notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMarkAllRead = async () => {
    const result = await notifications.markAllRead();
    if (!result.error) {
      setNotificationList((prev) =>
        prev.map((n) => ({ ...n, read_at: new Date().toISOString() }))
      );
      setUnreadCount(0);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read_at) {
      await notifications.markRead(notification.id);
      setNotificationList((prev) =>
        prev.map((n) =>
          n.id === notification.id
            ? { ...n, read_at: new Date().toISOString() }
            : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    setIsOpen(false);
  };

  const getNotificationLink = (notification: Notification): string => {
    const data = notification.data as Record<string, string> | null;
    const type = notification.type as string;
    switch (type) {
      case "new_message":
        return data?.conversation_id
          ? `/dashboard/messages/${data.conversation_id}`
          : "/dashboard/messages";
      case "new_application":
        return data?.gig_id
          ? `/gigs/${data.gig_id}`
          : "/dashboard/gigs";
      case "application_status":
      case "application_shortlisted":
      case "application_accepted":
      case "application_rejected":
        return "/dashboard/applications";
      case "new_comment":
        return data?.post_id
          ? `/post/${data.post_id}`
          : data?.gig_id
            ? `/gigs/${data.gig_id}`
            : "/dashboard";
      case "review_received":
      case "new_review":
        return data?.reviewer_id
          ? `/u/${data.reviewer_id}`
          : "/dashboard";
      case "call_scheduled":
        return data?.call_id
          ? `/dashboard/calls/${data.call_id}`
          : "/dashboard";
      default:
        return "/dashboard";
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="relative"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-card border border-border rounded-lg shadow-lg z-50">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <h3 className="font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllRead}
                className="text-xs"
              >
                <CheckCheck className="h-3 w-3 mr-1" />
                Mark all read
              </Button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-muted-foreground">
                Loading...
              </div>
            ) : notificationList.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                No notifications yet
              </div>
            ) : (
              notificationList.map((notification) => (
                <Link
                  key={notification.id}
                  href={getNotificationLink(notification)}
                  onClick={() => handleNotificationClick(notification)}
                  className={cn(
                    "flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors border-b border-border last:border-b-0",
                    !notification.read_at && "bg-primary/5"
                  )}
                >
                  <div
                    className={cn(
                      "flex-shrink-0 p-2 rounded-full",
                      notification.read_at
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary/10 text-primary"
                    )}
                  >
                    {NOTIFICATION_ICONS[notification.type] || <Bell className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm",
                        !notification.read_at && "font-medium"
                      )}
                    >
                      {notification.title}
                    </p>
                    {notification.body && (
                      <p className="text-xs text-muted-foreground truncate">
                        {notification.body}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatRelativeTime(notification.created_at)}
                    </p>
                  </div>
                  {!notification.read_at && (
                    <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-2" />
                  )}
                </Link>
              ))
            )}
          </div>

          <Link
            href="/dashboard/notifications"
            className="block p-3 text-center text-sm text-primary hover:bg-muted/50 border-t border-border"
            onClick={() => setIsOpen(false)}
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
