"use client";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { MessageWithSender } from "@/types";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  message: MessageWithSender;
  isOwn: boolean;
  showAvatar?: boolean;
}

export function MessageBubble({
  message,
  isOwn,
  showAvatar = true,
}: MessageBubbleProps) {
  const sender = message.sender;
  const initials = (sender.full_name || sender.username || "U")
    .charAt(0)
    .toUpperCase();

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div
      className={cn(
        "flex gap-2 max-w-[80%]",
        isOwn ? "ml-auto flex-row-reverse" : ""
      )}
    >
      {showAvatar && (
        <Avatar className="h-8 w-8 flex-shrink-0">
          {sender.avatar_url ? (
            <AvatarImage
              src={sender.avatar_url}
              alt={sender.full_name || sender.username}
            />
          ) : (
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          )}
        </Avatar>
      )}
      {!showAvatar && <div className="w-8 flex-shrink-0" />}

      <div className={cn("flex flex-col", isOwn ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-sm",
            isOwn
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground"
          )}
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        <span className="text-xs text-muted-foreground mt-1">
          {formatTime(message.created_at)}
        </span>
      </div>
    </div>
  );
}
