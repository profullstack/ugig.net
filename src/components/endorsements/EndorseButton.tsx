"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ThumbsUp } from "lucide-react";

interface EndorseButtonProps {
  username: string;
  skill: string;
  isEndorsed: boolean;
  count: number;
  disabled?: boolean;
  onEndorsed?: () => void;
}

export function EndorseButton({
  username,
  skill,
  isEndorsed: initialIsEndorsed,
  count: initialCount,
  disabled,
  onEndorsed,
}: EndorseButtonProps) {
  const [isEndorsed, setIsEndorsed] = useState(initialIsEndorsed);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    setLoading(true);
    try {
      if (isEndorsed) {
        // Remove endorsement
        const res = await fetch(
          `/api/users/${encodeURIComponent(username)}/endorse?skill=${encodeURIComponent(skill)}`,
          { method: "DELETE" }
        );
        if (res.ok) {
          setIsEndorsed(false);
          setCount((c) => Math.max(0, c - 1));
          onEndorsed?.();
        }
      } else {
        // Add endorsement
        const res = await fetch(
          `/api/users/${encodeURIComponent(username)}/endorse`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ skill }),
          }
        );
        if (res.ok) {
          setIsEndorsed(true);
          setCount((c) => c + 1);
          onEndorsed?.();
        }
      }
    } catch {
      // Silently fail — optimistic UI could be added later
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant={isEndorsed ? "default" : "outline"}
      size="sm"
      className="gap-1.5 text-xs h-7"
      onClick={handleToggle}
      disabled={loading || disabled}
    >
      <ThumbsUp className={`h-3 w-3 ${isEndorsed ? "fill-current" : ""}`} />
      {count > 0 && <span>{count}</span>}
    </Button>
  );
}
