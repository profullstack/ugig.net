"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, MessageSquare } from "lucide-react";
import Link from "next/link";

interface FeedItem {
  type: "post" | "comment";
  id: string;
  title: string;
  summary: string;
  created_at: string;
  upvotes?: number;
  comments?: number;
  link: string;
}

interface UserFeedProps {
  username: string;
  limit?: number;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function UserFeed({ username, limit = 20 }: UserFeedProps) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const fetchFeed = useCallback(
    async (currentOffset: number) => {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/users/${username}/feed?limit=${limit}&offset=${currentOffset}`
        );
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Failed to load feed");
          return;
        }
        const data = await res.json();
        if (currentOffset === 0) {
          setItems(data.data);
        } else {
          setItems((prev) => [...prev, ...data.data]);
        }
        setHasMore(data.data.length === limit);
      } catch {
        setError("Failed to load feed");
      } finally {
        setLoading(false);
      }
    },
    [username, limit]
  );

  useEffect(() => {
    fetchFeed(0);
  }, [fetchFeed]);

  const loadMore = () => {
    const newOffset = offset + limit;
    setOffset(newOffset);
    fetchFeed(newOffset);
  };

  if (loading && items.length === 0) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 p-4">
            <Skeleton className="h-5 w-5 mt-0.5 rounded" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>{error}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No posts or comments yet.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="divide-y divide-border">
        {items.map((item) => (
          <Link
            key={`${item.type}-${item.id}`}
            href={item.link}
            className="flex items-start gap-3 p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="mt-0.5 text-muted-foreground">
              {item.type === "post" ? (
                <FileText className="h-4 w-4" />
              ) : (
                <MessageSquare className="h-4 w-4" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-muted-foreground uppercase">
                  {item.type}
                </span>
                <span className="text-xs text-muted-foreground">
                  {timeAgo(item.created_at)}
                </span>
              </div>
              <p className="font-medium text-sm truncate">{item.title}</p>
              {item.summary && (
                <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                  {item.summary}
                </p>
              )}
              {item.type === "post" && (
                <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                  {item.upvotes !== undefined && (
                    <span>↑ {item.upvotes}</span>
                  )}
                  {item.comments !== undefined && (
                    <span>💬 {item.comments}</span>
                  )}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              loadMore();
            }}
            disabled={loading}
          >
            {loading ? "Loading..." : "Load More"}
          </Button>
        </div>
      )}
    </div>
  );
}
