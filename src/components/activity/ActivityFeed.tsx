"use client";

import { useEffect, useState, useCallback } from "react";
import { ActivityItem } from "./ActivityItem";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface Activity {
  id: string;
  user_id: string;
  activity_type: string;
  reference_id: string | null;
  reference_type: string | null;
  metadata: Record<string, unknown>;
  is_public: boolean;
  created_at: string;
  user?: {
    id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

interface ActivityFeedProps {
  username?: string;
  showUser?: boolean;
  limit?: number;
  /** If true, fetches the authenticated user's own feed (including private) */
  ownFeed?: boolean;
}

export function ActivityFeed({
  username,
  showUser = false,
  limit = 20,
  ownFeed = false,
}: ActivityFeedProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const fetchActivities = useCallback(
    async (currentOffset: number) => {
      try {
        setLoading(true);
        const url = ownFeed
          ? `/api/activity?limit=${limit}&offset=${currentOffset}`
          : `/api/users/${username}/activity?limit=${limit}&offset=${currentOffset}`;
        const response = await fetch(url);

        if (!response.ok) {
          const data = await response.json();
          setError(data.error || "Failed to load activities");
          return;
        }

        const data = await response.json();

        if (currentOffset === 0) {
          setActivities(data.data);
        } else {
          setActivities((prev) => [...prev, ...data.data]);
        }

        setTotal(data.pagination.total);
        setHasMore(
          currentOffset + data.data.length < data.pagination.total
        );
      } catch {
        setError("Failed to load activities");
      } finally {
        setLoading(false);
      }
    },
    [username, limit, ownFeed]
  );

  useEffect(() => {
    fetchActivities(0);
  }, [fetchActivities]);

  const loadMore = () => {
    const newOffset = offset + limit;
    setOffset(newOffset);
    fetchActivities(newOffset);
  };

  if (loading && activities.length === 0) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 p-3">
            <Skeleton className="h-4 w-4 mt-0.5 rounded" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
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

  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No activity yet.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="divide-y divide-border">
        {activities.map((activity) => (
          <ActivityItem
            key={activity.id}
            activity={activity}
            showUser={showUser}
          />
        ))}
      </div>
      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={loading}
          >
            {loading ? "Loading..." : `Load More (${total - activities.length} remaining)`}
          </Button>
        </div>
      )}
    </div>
  );
}
