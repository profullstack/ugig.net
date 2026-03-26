"use client";

import { useFundingTotal } from "@/hooks/useFundingTotal";
import { Heart, Users } from "lucide-react";

interface FundingProgressProps {
  /** Optional funding goal in USD */
  goal?: number;
  /** Compact mode for footer */
  compact?: boolean;
}

export function FundingProgress({ goal = 1000, compact = false }: FundingProgressProps) {
  const { data, loading } = useFundingTotal();

  if (loading || !data) {
    if (compact) return null;
    return (
      <div className="border rounded-lg p-6 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3 mb-3" />
        <div className="h-8 bg-muted rounded w-1/2 mb-3" />
        <div className="h-2 bg-muted rounded w-full" />
      </div>
    );
  }

  const percentage = Math.min((data.total_usd / goal) * 100, 100);

  if (compact) {
    return (
      <span className="text-sm text-muted-foreground flex items-center gap-1.5">
        <Heart className="h-3.5 w-3.5 text-pink-500" />
        <span>${data.total_usd.toLocaleString()} funded</span>
      </span>
    );
  }

  return (
    <div className="border rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Heart className="h-5 w-5 text-pink-500" />
          Funding Progress
        </h3>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          {data.contributors} {data.contributors === 1 ? "supporter" : "supporters"}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-bold">
            ${data.total_usd.toLocaleString()}
          </span>
          <span className="text-muted-foreground">
            of ${goal.toLocaleString()} goal
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <p className="text-sm text-muted-foreground">
          {percentage.toFixed(0)}% of goal reached
        </p>
      </div>
    </div>
  );
}
