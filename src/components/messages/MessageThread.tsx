"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { TypingIndicator } from "./TypingIndicator";
import { StartVideoCallButton } from "@/components/video/StartVideoCallButton";
import { useMessageStream } from "@/hooks/useMessageStream";
import type { MessageWithSender, Profile, Gig } from "@/types";
import { ArrowLeft, Wifi, WifiOff, ExternalLink } from "lucide-react";

interface MessageThreadProps {
  conversationId: string;
  currentUserId: string;
  participants: Pick<Profile, "id" | "username" | "full_name" | "avatar_url">[];
  gig?: Pick<Gig, "id" | "title"> | null;
}

export function MessageThread({
  conversationId,
  currentUserId,
  participants,
  gig,
}: MessageThreadProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get the other participant
  const otherParticipant = participants.find((p) => p.id !== currentUserId);
  const otherInitials = (
    otherParticipant?.full_name ||
    otherParticipant?.username ||
    "U"
  )
    .charAt(0)
    .toUpperCase();

  // Handle incoming messages from SSE
  const handleNewMessage = useCallback((message: MessageWithSender) => {
    setMessages((prev) => {
      // Avoid duplicates
      if (prev.some((m) => m.id === message.id)) {
        return prev;
      }
      return [...prev, message];
    });
  }, []);

  const { isConnected, reconnect, sendTyping, isOtherTyping } = useMessageStream(conversationId, {
    onMessage: handleNewMessage,
  });

  // Fetch initial messages
  useEffect(() => {
    async function fetchMessages() {
      try {
        const response = await fetch(
          `/api/conversations/${conversationId}/messages`
        );
        const result = await response.json();

        if (!response.ok) {
          setError(result.error || "Failed to load messages");
          return;
        }

        setMessages(result.data || []);
      } catch {
        setError("Failed to load messages");
      } finally {
        setIsLoading(false);
      }
    }

    fetchMessages();
  }, [conversationId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send message handler
  const handleSend = async (content: string) => {
    const response = await fetch(
      `/api/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Failed to send message");
    }

    // Always add the message optimistically from the POST response.
    // SSE may deliver it again but handleNewMessage deduplicates by id.
    if (result.data) {
      handleNewMessage(result.data);
    }
  };

  // Group messages by date
  const groupedMessages = messages.reduce(
    (groups, message) => {
      const date = new Date(message.created_at).toLocaleDateString();
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(message);
      return groups;
    },
    {} as Record<string, MessageWithSender[]>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-border">
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="flex-1 p-4 space-y-4">
          <Skeleton className="h-12 w-[60%]" />
          <Skeleton className="h-12 w-[40%] ml-auto" />
          <Skeleton className="h-12 w-[50%]" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border bg-card flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/dashboard/messages")}
          className="md:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <Avatar className="h-10 w-10">
          {otherParticipant?.avatar_url ? (
            <AvatarImage
              src={otherParticipant.avatar_url}
              alt={otherParticipant.full_name || otherParticipant.username}
            />
          ) : (
            <AvatarFallback>{otherInitials}</AvatarFallback>
          )}
        </Avatar>

        <div className="flex-1 min-w-0">
          <Link
            href={`/u/${otherParticipant?.username}`}
            className="font-medium hover:underline truncate block"
          >
            {otherParticipant?.full_name || otherParticipant?.username}
          </Link>
          {gig && (
            <Link
              href={`/gigs/${gig.id}`}
              className="text-sm text-muted-foreground hover:underline flex items-center gap-1"
            >
              {gig.title}
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>

        {/* Video call button */}
        {otherParticipant && (
          <StartVideoCallButton
            participantId={otherParticipant.id}
            gigId={gig?.id}
            variant="ghost"
            size="sm"
          />
        )}

        {/* Connection status */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {isConnected ? (
            <>
              <Wifi className="h-3 w-3 text-green-500" />
              <span className="hidden sm:inline">Live</span>
            </>
          ) : (
            <button
              onClick={reconnect}
              className="flex items-center gap-1 hover:text-foreground"
            >
              <WifiOff className="h-3 w-3 text-yellow-500" />
              <span className="hidden sm:inline">Reconnect</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4"
      >
        {error && (
          <div className="text-center text-destructive text-sm py-4">
            {error}
          </div>
        )}

        {messages.length === 0 && !error && (
          <div className="text-center text-muted-foreground text-sm py-8">
            No messages yet. Start the conversation!
          </div>
        )}

        {Object.entries(groupedMessages).map(([date, dateMessages]) => (
          <div key={date}>
            {/* Date separator */}
            <div className="flex items-center gap-2 my-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">{date}</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Messages for this date */}
            <div className="space-y-2">
              {dateMessages.map((message, index) => {
                const isOwn = message.sender_id === currentUserId;
                const prevMessage = dateMessages[index - 1];
                const showAvatar =
                  !prevMessage || prevMessage.sender_id !== message.sender_id;

                return (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    isOwn={isOwn}
                    showAvatar={showAvatar}
                    otherParticipantId={otherParticipant?.id}
                  />
                );
              })}
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      {isOtherTyping && (
        <div className="px-4 py-2 border-t border-border bg-card/50">
          <TypingIndicator
            userName={otherParticipant?.full_name || otherParticipant?.username}
          />
        </div>
      )}

      {/* Input */}
      <MessageInput onSend={handleSend} onTyping={sendTyping} />
    </div>
  );
}
