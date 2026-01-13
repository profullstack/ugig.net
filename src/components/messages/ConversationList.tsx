"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { ConversationWithPreview } from "@/types";
import { cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";

interface ConversationListProps {
  currentUserId: string;
}

export function ConversationList({ currentUserId }: ConversationListProps) {
  const pathname = usePathname();
  const [conversations, setConversations] = useState<ConversationWithPreview[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchConversations() {
      try {
        const response = await fetch("/api/conversations");
        const result = await response.json();

        if (!response.ok) {
          setError(result.error || "Failed to load conversations");
          return;
        }

        setConversations(result.data || []);
      } catch {
        setError("Failed to load conversations");
      } finally {
        setIsLoading(false);
      }
    }

    fetchConversations();
  }, []);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-destructive text-sm">{error}</div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="p-8 text-center">
        <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No conversations yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Start a conversation from a gig application
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {conversations.map((conv) => {
        const otherParticipant = conv.participants.find(
          (p) => p.id !== currentUserId
        );
        const initials = (
          otherParticipant?.full_name ||
          otherParticipant?.username ||
          "U"
        )
          .charAt(0)
          .toUpperCase();

        const isActive = pathname === `/dashboard/messages/${conv.id}`;
        const hasUnread = conv.unread_count > 0;

        return (
          <Link
            key={conv.id}
            href={`/dashboard/messages/${conv.id}`}
            className={cn(
              "flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors",
              isActive && "bg-muted"
            )}
          >
            <Avatar className="h-10 w-10 flex-shrink-0">
              {otherParticipant?.avatar_url ? (
                <AvatarImage
                  src={otherParticipant.avatar_url}
                  alt={otherParticipant.full_name || otherParticipant.username}
                />
              ) : (
                <AvatarFallback>{initials}</AvatarFallback>
              )}
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "font-medium truncate",
                    hasUnread && "font-semibold"
                  )}
                >
                  {otherParticipant?.full_name || otherParticipant?.username}
                </span>
                {conv.last_message && (
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {formatTime(conv.last_message.created_at)}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {conv.gig && (
                    <p className="text-xs text-primary truncate">
                      {conv.gig.title}
                    </p>
                  )}
                  {conv.last_message && (
                    <p
                      className={cn(
                        "text-sm truncate",
                        hasUnread
                          ? "text-foreground font-medium"
                          : "text-muted-foreground"
                      )}
                    >
                      {conv.last_message.sender_id === currentUserId && "You: "}
                      {conv.last_message.content}
                    </p>
                  )}
                </div>

                {hasUnread && (
                  <Badge
                    variant="default"
                    className="h-5 min-w-[20px] flex items-center justify-center text-xs"
                  >
                    {conv.unread_count}
                  </Badge>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
