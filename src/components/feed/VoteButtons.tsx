"use client";

import { useState } from "react";
import { ArrowBigUp, ArrowBigDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoteButtonsProps {
  postId: string;
  initialScore: number;
  initialUserVote: number | null;
}

export function VoteButtons({
  postId,
  initialScore,
  initialUserVote,
}: VoteButtonsProps) {
  const [score, setScore] = useState(initialScore);
  const [userVote, setUserVote] = useState<number | null>(initialUserVote);
  const [loading, setLoading] = useState(false);

  const handleVote = async (direction: "upvote" | "downvote") => {
    if (loading) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/posts/${postId}/${direction}`, {
        method: "POST",
      });

      if (res.status === 401) {
        // Not authenticated — redirect to login
        window.location.href = "/login";
        return;
      }

      if (!res.ok) return;

      const data = await res.json();
      setScore(data.score);
      setUserVote(data.user_vote);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleVote("upvote");
        }}
        disabled={loading}
        className={cn(
          "p-1 rounded hover:bg-muted transition-colors",
          userVote === 1 && "text-orange-500"
        )}
        aria-label="Upvote"
      >
        <ArrowBigUp
          className="h-6 w-6"
          fill={userVote === 1 ? "currentColor" : "none"}
        />
      </button>
      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          userVote === 1 && "text-orange-500",
          userVote === -1 && "text-blue-500"
        )}
      >
        {score}
      </span>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleVote("downvote");
        }}
        disabled={loading}
        className={cn(
          "p-1 rounded hover:bg-muted transition-colors",
          userVote === -1 && "text-blue-500"
        )}
        aria-label="Downvote"
      >
        <ArrowBigDown
          className="h-6 w-6"
          fill={userVote === -1 ? "currentColor" : "none"}
        />
      </button>
    </div>
  );
}
