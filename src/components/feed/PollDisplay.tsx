"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { BarChart3, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface PollOption {
  id: string;
  text: string;
  votes: number;
  percentage: number;
}

interface PollDisplayProps {
  postId: string;
  isLoggedIn: boolean;
}

export function PollDisplay({ postId, isLoggedIn }: PollDisplayProps) {
  const [options, setOptions] = useState<PollOption[]>([]);
  const [totalVotes, setTotalVotes] = useState(0);
  const [userVote, setUserVote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    fetch(`/api/posts/${postId}/poll/vote`)
      .then((r) => r.json())
      .then((data) => {
        setOptions(data.options || []);
        setTotalVotes(data.total_votes || 0);
        setUserVote(data.user_vote || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [postId]);

  const handleVote = async (optionId: string) => {
    if (!isLoggedIn || voting) return;
    setVoting(true);

    try {
      const res = await fetch(`/api/posts/${postId}/poll/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option_id: optionId }),
      });

      if (res.ok) {
        // Refetch results
        const data = await fetch(`/api/posts/${postId}/poll/vote`).then((r) => r.json());
        setOptions(data.options || []);
        setTotalVotes(data.total_votes || 0);
        setUserVote(data.user_vote || null);
      }
    } catch {}
    setVoting(false);
  };

  if (loading) {
    return (
      <div className="space-y-2 mt-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 bg-muted/50 rounded-md animate-pulse" />
        ))}
      </div>
    );
  }

  if (options.length === 0) return null;

  const hasVoted = userVote !== null;
  const showResults = hasVoted || !isLoggedIn;

  return (
    <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
      {options.map((option) => {
        const isSelected = userVote === option.id;
        const isWinner = showResults && option.votes === Math.max(...options.map((o) => o.votes)) && option.votes > 0;

        if (showResults) {
          return (
            <div
              key={option.id}
              className={cn(
                "relative rounded-md border overflow-hidden transition-colors",
                isSelected ? "border-primary" : "border-border"
              )}
            >
              {/* Background bar */}
              <div
                className={cn(
                  "absolute inset-y-0 left-0 transition-all duration-500",
                  isSelected ? "bg-primary/15" : "bg-muted/50"
                )}
                style={{ width: `${option.percentage}%` }}
              />
              {/* Content */}
              <div className="relative flex items-center justify-between px-3 py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  {isSelected && <Check className="h-4 w-4 text-primary" />}
                  <span className={cn(isWinner && "font-semibold")}>{option.text}</span>
                </span>
                <span className={cn("font-medium", isWinner && "text-primary")}>
                  {option.percentage}%
                </span>
              </div>
            </div>
          );
        }

        return (
          <Button
            key={option.id}
            variant="outline"
            className="w-full justify-start text-left h-auto py-2.5"
            onClick={() => handleVote(option.id)}
            disabled={voting}
          >
            {option.text}
          </Button>
        );
      })}

      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
        <BarChart3 className="h-3 w-3" />
        <span>{totalVotes} {totalVotes === 1 ? "vote" : "votes"}</span>
      </div>
    </div>
  );
}
