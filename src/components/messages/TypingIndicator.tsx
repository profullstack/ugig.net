"use client";

import { cn } from "@/lib/utils";

interface TypingIndicatorProps {
  userName?: string;
  className?: string;
}

export function TypingIndicator({ userName, className }: TypingIndicatorProps) {
  return (
    <div
      className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}
      role="status"
      aria-label={userName ? `${userName} is typing` : "Someone is typing"}
    >
      <div className="flex gap-1">
        <span
          className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </div>
      <span>{userName ? `${userName} is typing...` : "Typing..."}</span>
    </div>
  );
}
