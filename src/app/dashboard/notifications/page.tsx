"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Bell,
  ArrowLeft,
  MessageSquare,
  FileText,
  Briefcase,
  Star,
  DollarSign,
  Video,
  CheckCheck,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { notifications as notificationsApi } from "@/lib/api";
import { formatRelativeTime, cn } from "@/lib/utils";
import type { Database } from "@/types/database";

type Notification = Database["public"]["Tables"]["notifications"]["Row"];

const NOTIFICATION_ICONS: Record<string, React.ReactNode> = {
  new_application: <FileText className="h-5 w-5" />,
  application_shortlisted: <Briefcase className="h-5 w-5" />,
  application_accepted: <CheckCheck className="h-5 w-5" />,
  application_rejected: <FileText className="h-5 w-5" />,
  new_message: <MessageSquare className="h-5 w-5" />,
  call_scheduled: <Video className="h-5 w-5" />,
  new_review: <Star className="h-5 w-5" />,
  gig_update: <Briefcase className="h-5 w-5" />,
  payment_received: <DollarSign className="h-5 w-5" />,
};

const NOTIFICATION_LABELS: Record<string, string> = {
  new_application: "New Application",
  application_shortlisted: "Application Shortlisted",
  application_accepted: "Application Accepted",
  application_rejected: "Application Update",
  new_message: "New Message",
  call_scheduled: "Call Scheduled",
  new_review: "Review Received",
  gig_update: "Gig Update",
  payment_received: "Payment Received",
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const limit = 20;

  useEffect(() => {
    async function fetchNotifications() {
      const result = await notificationsApi.list({ limit, offset: 0 });
      if (!result.error && result.data) {
        const data = result.data as {
          notifications: Notification[];
          pagination: { total: number };
        };
        setNotifications(data.notifications || []);
        setHasMore(data.notifications.length < data.pagination.total);
      }
      setIsLoading(false);
    }
    fetchNotifications();
  }, []);

  const loadMore = async () => {
    setIsLoadingMore(true);
    const newOffset = offset + limit;
    const result = await notificationsApi.list({ limit, offset: newOffset });
    if (!result.error && result.data) {
      const data = result.data as {
        notifications: Notification[];
        pagination: { total: number };
      };
      setNotifications((prev) => [...prev, ...data.notifications]);
      setOffset(newOffset);
      setHasMore(notifications.length + data.notifications.length < data.pagination.total);
    }
    setIsLoadingMore(false);
  };

  const handleMarkAllRead = async () => {
    setIsMarkingAllRead(true);
    const result = await notificationsApi.markAllRead();
    if (!result.error) {
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: new Date().toISOString() }))
      );
    }
    setIsMarkingAllRead(false);
  };

  const handleMarkRead = async (notification: Notification) => {
    if (notification.read_at) return;
    await notificationsApi.markRead(notification.id);
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notification.id
          ? { ...n, read_at: new Date().toISOString() }
          : n
      )
    );
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
        return data?.gig_id ? `/gigs/${data.gig_id}` : "/dashboard/gigs";
      case "application_status":
      case "application_shortlisted":
      case "application_accepted":
      case "application_rejected":
        return "/dashboard/applications";
      case "review_received":
      case "new_review":
        return data?.reviewer_id ? `/u/${data.reviewer_id}` : "/dashboard";
      case "call_scheduled":
        return data?.call_id ? `/dashboard/calls/${data.call_id}` : "/dashboard";
      default:
        return "/dashboard";
    }
  };

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  if (isLoading) {
    return (
      <div className="container max-w-2xl py-8">
        <div className="flex items-center gap-4 mb-8">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Bell className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Notifications</h1>
            {unreadCount > 0 && (
              <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                {unreadCount} new
              </span>
            )}
          </div>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={isMarkingAllRead}
          >
            {isMarkingAllRead ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4 mr-2" />
            )}
            Mark all as read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">No notifications yet</h2>
          <p className="text-muted-foreground">
            You&apos;ll see notifications here when something important happens
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {notifications.map((notification) => (
            <Link
              key={notification.id}
              href={getNotificationLink(notification)}
              onClick={() => handleMarkRead(notification)}
              className={cn(
                "flex items-start gap-4 p-4 hover:bg-muted/50 transition-colors",
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
                {NOTIFICATION_ICONS[notification.type] || <Bell className="h-5 w-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-muted-foreground">
                    {NOTIFICATION_LABELS[notification.type] || "Notification"}
                  </span>
                  {!notification.read_at && (
                    <span className="h-2 w-2 rounded-full bg-primary" />
                  )}
                </div>
                <p
                  className={cn(
                    "text-sm",
                    !notification.read_at && "font-medium"
                  )}
                >
                  {notification.title}
                </p>
                {notification.body && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {notification.body}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  {formatRelativeTime(notification.created_at)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="text-center mt-6">
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              "Load more"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
