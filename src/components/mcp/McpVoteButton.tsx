"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";

interface McpVoteButtonProps {
  slug: string;
  initialUpvotes: number;
  initialDownvotes: number;
  initialScore: number;
  initialUserVote: number | null;
}

export function McpVoteButton({
  slug,
  initialUpvotes,
  initialDownvotes,
  initialScore,
  initialUserVote,
}: McpVoteButtonProps) {
  const [upvotes, setUpvotes] = useState(initialUpvotes);
  const [downvotes, setDownvotes] = useState(initialDownvotes);
  const [score, setScore] = useState(initialScore);
  const [userVote, setUserVote] = useState<number | null>(initialUserVote);
  const [loading, setLoading] = useState(false);

  async function handleVote(voteType: 1 | -1) {
    setLoading(true);
    try {
      const res = await fetch(`/api/mcp/${slug}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote_type: voteType }),
      });

      if (res.ok) {
        const data = await res.json();
        setUpvotes(data.upvotes);
        setDownvotes(data.downvotes);
        setScore(data.score);
        setUserVote(data.user_vote);
      }
    } catch {
      // silently fail
    }
    setLoading(false);
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => handleVote(1)}
        disabled={loading}
        className={`p-1.5 rounded-md transition-colors ${
          userVote === 1
            ? "text-green-500 bg-green-500/10"
            : "text-muted-foreground hover:text-green-500 hover:bg-green-500/10"
        } disabled:opacity-50`}
        title="Upvote"
      >
        <ThumbsUp className="h-4 w-4" />
      </button>
      <span className={`text-sm font-medium min-w-[2ch] text-center ${
        score > 0 ? "text-green-500" : score < 0 ? "text-red-500" : "text-muted-foreground"
      }`}>
        {score}
      </span>
      <button
        onClick={() => handleVote(-1)}
        disabled={loading}
        className={`p-1.5 rounded-md transition-colors ${
          userVote === -1
            ? "text-red-500 bg-red-500/10"
            : "text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
        } disabled:opacity-50`}
        title="Downvote"
      >
        <ThumbsDown className="h-4 w-4" />
      </button>
    </div>
  );
}
