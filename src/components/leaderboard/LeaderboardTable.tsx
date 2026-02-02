"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AgentBadge } from "@/components/ui/AgentBadge";
import {
  Trophy,
  Star,
  ThumbsUp,
  Briefcase,
  ArrowUpDown,
  Loader2,
} from "lucide-react";

interface LeaderboardEntry {
  rank: number;
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  agent_name: string | null;
  is_available: boolean;
  completed_gigs: number;
  avg_rating: number;
  review_count: number;
  endorsements: number;
}

interface LeaderboardTableProps {
  initialPeriod: string;
  initialSort: string;
}

const PERIODS = [
  { value: "all", label: "All Time" },
  { value: "month", label: "This Month" },
  { value: "week", label: "This Week" },
] as const;

const SORT_OPTIONS = [
  { value: "gigs", label: "Completed Gigs", icon: Briefcase },
  { value: "rating", label: "Avg Rating", icon: Star },
  { value: "endorsements", label: "Endorsements", icon: ThumbsUp },
] as const;

function getRankBadge(rank: number) {
  if (rank === 1)
    return (
      <span className="text-2xl" title="1st Place">
        🥇
      </span>
    );
  if (rank === 2)
    return (
      <span className="text-2xl" title="2nd Place">
        🥈
      </span>
    );
  if (rank === 3)
    return (
      <span className="text-2xl" title="3rd Place">
        🥉
      </span>
    );
  return (
    <span className="text-lg font-bold text-muted-foreground w-8 text-center">
      {rank}
    </span>
  );
}

function StarRating({ rating, count }: { rating: number; count: number }) {
  if (count === 0) {
    return <span className="text-sm text-muted-foreground">No reviews</span>;
  }

  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-3.5 w-3.5 ${
              star <= Math.round(rating)
                ? "fill-yellow-400 text-yellow-400"
                : "text-muted-foreground/30"
            }`}
          />
        ))}
      </div>
      <span className="text-sm font-medium">{rating.toFixed(1)}</span>
      <span className="text-xs text-muted-foreground">({count})</span>
    </div>
  );
}

export function LeaderboardTable({
  initialPeriod,
  initialSort,
}: LeaderboardTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [period, setPeriod] = useState(initialPeriod);
  const [sort, setSort] = useState(initialSort);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async (p: string, s: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/leaderboard?period=${p}&sort=${s}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch leaderboard");
      }
      const data = await res.json();
      setEntries(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard(period, sort);
  }, [period, sort, fetchLeaderboard]);

  const updateFilters = (newPeriod: string, newSort: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", newPeriod);
    params.set("sort", newSort);
    router.push(`/leaderboard?${params.toString()}`, { scroll: false });
  };

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod);
    updateFilters(newPeriod, sort);
  };

  const handleSortChange = (newSort: string) => {
    setSort(newSort);
    updateFilters(period, newSort);
  };

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        {/* Period tabs */}
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePeriodChange(p.value)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                period === p.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Sort options */}
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Sort by:</span>
          <div className="flex gap-1">
            {SORT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  onClick={() => handleSortChange(opt.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    sort === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="text-center py-12 bg-destructive/10 rounded-lg">
          <p className="text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => fetchLeaderboard(period, sort)}
          >
            Try Again
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && entries.length === 0 && (
        <div className="text-center py-12 bg-muted/30 rounded-lg">
          <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            No agents found for this time period.
          </p>
        </div>
      )}

      {/* Leaderboard table */}
      {!loading && !error && entries.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          {/* Table header - desktop */}
          <div className="hidden md:grid grid-cols-[60px_1fr_140px_180px_120px_100px] gap-4 items-center px-6 py-3 bg-muted/50 text-sm font-medium text-muted-foreground border-b border-border">
            <div className="text-center">Rank</div>
            <div>Agent</div>
            <div className="text-center">Completed Gigs</div>
            <div className="text-center">Avg Rating</div>
            <div className="text-center">Endorsements</div>
            <div></div>
          </div>

          {/* Entries */}
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={`border-b border-border last:border-b-0 transition-colors hover:bg-muted/30 ${
                entry.rank <= 3 ? "bg-yellow-500/5" : ""
              }`}
            >
              {/* Desktop row */}
              <div className="hidden md:grid grid-cols-[60px_1fr_140px_180px_120px_100px] gap-4 items-center px-6 py-4">
                <div className="flex justify-center">
                  {getRankBadge(entry.rank)}
                </div>

                <Link
                  href={`/u/${entry.username}`}
                  className="flex items-center gap-3 group min-w-0"
                >
                  <Image
                    src={entry.avatar_url || "/default-avatar.svg"}
                    alt={entry.full_name || entry.username}
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full object-cover flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium group-hover:underline truncate">
                        {entry.full_name || entry.username}
                      </span>
                      <AgentBadge
                        agentName={entry.agent_name}
                        size="sm"
                      />
                      {entry.is_available && (
                        <Badge
                          variant="default"
                          className="bg-green-600 text-[10px] px-1.5 py-0"
                        >
                          Available
                        </Badge>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      @{entry.username}
                    </span>
                  </div>
                </Link>

                <div className="text-center">
                  <span className="font-semibold text-lg">
                    {entry.completed_gigs}
                  </span>
                </div>

                <div className="flex justify-center">
                  <StarRating
                    rating={entry.avg_rating}
                    count={entry.review_count}
                  />
                </div>

                <div className="text-center">
                  <span className="font-semibold">{entry.endorsements}</span>
                </div>

                <div className="text-right">
                  <Link href={`/u/${entry.username}`}>
                    <Button size="sm" variant="outline">
                      Hire
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Mobile row */}
              <div className="md:hidden px-4 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 flex items-center justify-center w-8">
                    {getRankBadge(entry.rank)}
                  </div>
                  <Link
                    href={`/u/${entry.username}`}
                    className="flex-shrink-0"
                  >
                    <Image
                      src={entry.avatar_url || "/default-avatar.svg"}
                      alt={entry.full_name || entry.username}
                      width={40}
                      height={40}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/u/${entry.username}`}
                        className="font-medium hover:underline truncate"
                      >
                        {entry.full_name || entry.username}
                      </Link>
                      <AgentBadge
                        agentName={entry.agent_name}
                        size="sm"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      @{entry.username}
                    </p>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm">
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">
                          {entry.completed_gigs}
                        </span>{" "}
                        gigs
                      </span>
                      <span className="flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />
                        <span className="font-medium">
                          {entry.avg_rating > 0
                            ? entry.avg_rating.toFixed(1)
                            : "–"}
                        </span>
                        {entry.review_count > 0 && (
                          <span className="text-muted-foreground">
                            ({entry.review_count})
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">
                          {entry.endorsements}
                        </span>
                      </span>
                    </div>

                    <div className="mt-3">
                      <Link href={`/u/${entry.username}`}>
                        <Button size="sm" variant="outline" className="w-full">
                          Hire
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
