"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MessageSquare, Loader2 } from "lucide-react";

interface StartConversationButtonProps {
  gigId?: string;
  recipientId: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function StartConversationButton({
  gigId,
  recipientId,
  variant = "outline",
  size = "sm",
  className,
}: StartConversationButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gig_id: gigId || null,
          recipient_id: recipientId,
        }),
      });

      const result = await response.json();

      if (response.ok && result.data) {
        router.push(`/dashboard/messages/${result.data.id}`);
      } else {
        console.error("Failed to create conversation:", result.error);
      }
    } catch (error) {
      console.error("Error creating conversation:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={isLoading}
      className={className}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <MessageSquare className="h-4 w-4 mr-2" />
          Message
        </>
      )}
    </Button>
  );
}
