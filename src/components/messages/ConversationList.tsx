"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ConversationWithPreview } from "@/types";
import { cn } from "@/lib/utils";
import { MessageSquare, Bot, Archive, Inbox, ArchiveRestore, Search, X } from "lucide-react";

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
  const [view, setView] = useState<"inbox" | "archived">("inbox");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchConversations = useCallback(async (archived: boolean) => {
    setIsLoading(true);
    setError(null);
    try {
      const url = archived
        ? "/api/conversations?archived=true"
        : "/api/conversations";
      const response = await fetch(url);
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
  }, []);

  useEffect(() => {
    fetchConversations(view === "archived");
  }, [view, fetchConversations]);

  const handleUnarchive = async (conversationId: string) => {
    try {
      const response = await fetch("/api/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          archive: false,
        }),
      });

      if (response.ok) {
        setConversations((prev) =>
          prev.filter((c) => c.id !== conversationId)
        );
      }
    } catch {
      // Silently fail — conversation stays in list
    }
  };

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

  // Filter conversations by search query (username, full_name, gig title, last message)
  const filteredConversations = searchQuery.trim()
    ? conversations.filter((conv) => {
        const q = searchQuery.toLowerCase();
        const otherParticipant = conv.participants.find(
          (p) => p.id !== currentUserId
        );
        const name = (
          otherParticipant?.full_name ||
          otherParticipant?.username ||
          ""
        ).toLowerCase();
        const username = (otherParticipant?.username || "").toLowerCase();
        const gigTitle = (conv.gig?.title || "").toLowerCase();
        const lastMsg = (conv.last_message?.content || "").toLowerCase();
        return (
          name.includes(q) ||
          username.includes(q) ||
          gigTitle.includes(q) ||
          lastMsg.includes(q)
        );
      })
    : conversations;

  const renderTabs = () => (
    <div className="flex border-b border-border">
      <button
        onClick={() => setView("inbox")}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
          view === "inbox"
            ? "border-b-2 border-primary text-primary"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Inbox className="h-4 w-4" />
        Inbox
      </button>
      <button
        onClick={() => setView("archived")}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
          view === "archived"
            ? "border-b-2 border-primary text-primary"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Archive className="h-4 w-4" />
        Archived
      </button>
    </div>
  );

  const renderSearchBar = () => (
    <div className="p-2 border-b border-border">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-8 py-1.5 text-sm bg-muted/50 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-muted-foreground"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <>
        {renderTabs()}
        {renderSearchBar()}
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
      </>
    );
  }

  if (error) {
    return (
      <>
        {renderTabs()}
        {renderSearchBar()}
        <div className="p-4 text-center text-destructive text-sm">{error}</div>
      </>
    );
  }

  if (conversations.length === 0) {
    return (
      <>
        {renderTabs()}
        {renderSearchBar()}
        <div className="p-8 text-center">
          {view === "archived" ? (
            <>
              <Archive className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No archived conversations</p>
              <p className="text-sm text-muted-foreground mt-1">
                Conversations with no activity for 2 weeks are auto-archived
              </p>
            </>
          ) : (
            <>
              <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No conversations yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Message someone from their profile or a gig application
              </p>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {renderTabs()}
      {renderSearchBar()}
      {filteredConversations.length === 0 && searchQuery.trim() ? (
        <div className="p-8 text-center">
          <Search className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">
            No conversations matching &ldquo;{searchQuery}&rdquo;
          </p>
        </div>
      ) : null}
      <div className="divide-y divide-border">
        {filteredConversations.map((conv) => {
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
            <div key={conv.id} className="flex items-center">
              <Link
                href={`/dashboard/messages/${conv.id}`}
                className={cn(
                  "flex-1 flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors",
                  isActive && "bg-muted"
                )}
              >
                <span
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(`/u/${otherParticipant?.username}`, "_blank");
                  }}
                  className="relative flex-shrink-0 cursor-pointer"
                >
                  <Avatar className="h-10 w-10">
                    {otherParticipant?.avatar_url ? (
                      <AvatarImage
                        src={otherParticipant.avatar_url}
                        alt={
                          otherParticipant.full_name ||
                          otherParticipant.username
                        }
                      />
                    ) : (
                      <AvatarFallback>{initials}</AvatarFallback>
                    )}
                  </Avatar>
                  {otherParticipant?.account_type === "agent" && (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 bg-purple-500 text-white rounded-full p-0.5"
                      title="AI Agent"
                    >
                      <Bot className="h-2.5 w-2.5" />
                    </span>
                  )}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "font-medium truncate",
                        hasUnread && "font-semibold"
                      )}
                    >
                      {otherParticipant?.full_name ||
                        otherParticipant?.username}
                    </span>
                    {otherParticipant?.account_type === "agent" && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 bg-purple-500/10 text-purple-500 border-purple-500/20"
                      >
                        Agent
                      </Badge>
                    )}
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
                          {conv.last_message.sender_id === currentUserId &&
                            "You: "}
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

              {view === "archived" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mr-2 flex-shrink-0"
                  onClick={() => handleUnarchive(conv.id)}
                  title="Move to inbox"
                >
                  <ArchiveRestore className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
