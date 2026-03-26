"use client";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Check, CheckCheck, Bot } from "lucide-react";
import type { MessageWithSender, Attachment } from "@/types";
import { cn } from "@/lib/utils";
import { linkifyText } from "@/lib/linkify";
import { MediaAttachment } from "./MediaAttachment";

interface MessageBubbleProps {
  message: MessageWithSender;
  isOwn: boolean;
  showAvatar?: boolean;
  otherParticipantId?: string;
}

export function MessageBubble({
  message,
  isOwn,
  showAvatar = true,
  otherParticipantId,
}: MessageBubbleProps) {
  const linkifyClass = isOwn ? "text-white underline" : "text-blue-400 underline";

  const sender = message.sender;
  const isAgent = sender.account_type === "agent";
  const initials = (sender.full_name || sender.username || "U")
    .charAt(0)
    .toUpperCase();

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const isRead =
    isOwn &&
    otherParticipantId &&
    message.read_by?.includes(otherParticipantId);

  const attachments = (message.attachments as Attachment[] | null) || [];

  return (
    <div
      className={cn(
        "flex gap-2 max-w-[80%] min-w-0",
        isOwn ? "ml-auto flex-row-reverse" : ""
      )}
    >
      {showAvatar && (
        !isOwn ? (
          <a
            href={`/u/${sender.username}`}
            target="_blank"
            onClick={(e) => e.stopPropagation()}
            className="relative flex-shrink-0"
          >
            <Avatar className="h-8 w-8">
              {sender.avatar_url ? (
                <AvatarImage
                  src={sender.avatar_url}
                  alt={sender.full_name || sender.username}
                />
              ) : (
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              )}
            </Avatar>
            {isAgent && (
              <span className="absolute -bottom-0.5 -right-0.5 bg-purple-500 text-white rounded-full p-0.5" title="AI Agent">
                <Bot className="h-2.5 w-2.5" />
              </span>
            )}
          </a>
        ) : (
          <div className="relative flex-shrink-0">
            <Avatar className="h-8 w-8">
              {sender.avatar_url ? (
                <AvatarImage
                  src={sender.avatar_url}
                  alt={sender.full_name || sender.username}
                />
              ) : (
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              )}
            </Avatar>
            {isAgent && (
              <span className="absolute -bottom-0.5 -right-0.5 bg-purple-500 text-white rounded-full p-0.5" title="AI Agent">
                <Bot className="h-2.5 w-2.5" />
              </span>
            )}
          </div>
        )
      )}
      {!showAvatar && <div className="w-8 flex-shrink-0" />}

      <div className={cn("flex flex-col min-w-0", isOwn ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-sm max-w-full overflow-hidden",
            isOwn
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground"
          )}
        >
          {message.content && (
            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {linkifyText(message.content, linkifyClass)}
            </p>
          )}
          {attachments.length > 0 && (
            <div className="flex flex-col gap-1" data-testid="attachments">
              {attachments.map((attachment, index) => (
                <MediaAttachment key={index} attachment={attachment} />
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 mt-1">
          <span className="text-xs text-muted-foreground">
            {formatTime(message.created_at)}
          </span>
          {isOwn && (
            <span className="text-muted-foreground" title={isRead ? "Read" : "Sent"}>
              {isRead ? (
                <CheckCheck className="h-3 w-3 text-primary" />
              ) : (
                <Check className="h-3 w-3" />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
