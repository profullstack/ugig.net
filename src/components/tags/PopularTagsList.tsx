"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Tag,
  Users,
  Briefcase,
  Heart,
  HeartOff,
  LogIn,
} from "lucide-react";

interface PopularTag {
  tag: string;
  gig_count: number;
  follower_count: number;
}

export function PopularTagsList() {
  const [tags, setTags] = useState<PopularTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followedTags, setFollowedTags] = useState<Set<string>>(new Set());
  const [togglingTags, setTogglingTags] = useState<Set<string>>(new Set());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const fetchTags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tags/popular?limit=50");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch tags");
      }
      const data = await res.json();
      setTags(data.tags);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session");
      if (res.ok) {
        const data = await res.json();
        setIsAuthenticated(!!data.user);
      } else {
        setIsAuthenticated(false);
      }
    } catch {
      setIsAuthenticated(false);
    }
  }, []);

  const fetchFollowedTags = useCallback(async () => {
    try {
      const res = await fetch("/api/tags/following");
      if (res.ok) {
        const data = await res.json();
        setFollowedTags(new Set(data.tags || []));
      }
    } catch {
      // Not authenticated or error — ignore
    }
  }, []);

  useEffect(() => {
    fetchTags();
    checkAuth();
  }, [fetchTags, checkAuth]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchFollowedTags();
    }
  }, [isAuthenticated, fetchFollowedTags]);

  const toggleFollow = async (tag: string) => {
    if (togglingTags.has(tag)) return;

    setTogglingTags((prev) => new Set(prev).add(tag));
    const isFollowing = followedTags.has(tag);
    const encodedTag = encodeURIComponent(tag);

    try {
      const res = await fetch(`/api/tags/${encodedTag}/follow`, {
        method: isFollowing ? "DELETE" : "POST",
      });

      if (res.ok) {
        setFollowedTags((prev) => {
          const next = new Set(prev);
          if (isFollowing) {
            next.delete(tag);
          } else {
            next.add(tag);
          }
          return next;
        });

        // Update the local follower count
        setTags((prev) =>
          prev.map((t) =>
            t.tag === tag
              ? {
                  ...t,
                  follower_count: t.follower_count + (isFollowing ? -1 : 1),
                }
              : t
          )
        );
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setTogglingTags((prev) => {
        const next = new Set(prev);
        next.delete(tag);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 bg-destructive/10 rounded-lg">
        <p className="text-destructive">{error}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={fetchTags}
        >
          Try Again
        </Button>
      </div>
    );
  }

  if (tags.length === 0) {
    return (
      <div className="text-center py-12 bg-muted/30 rounded-lg">
        <Tag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">
          No tags found yet. Tags will appear as gigs are posted.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {tags.map((item) => {
        const isFollowing = followedTags.has(item.tag);
        const isToggling = togglingTags.has(item.tag);

        return (
          <Card
            key={item.tag}
            className="transition-colors hover:border-primary/50 hover:shadow-md"
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/gigs?skill=${encodeURIComponent(item.tag)}`}
                  className="group flex items-center gap-2 min-w-0"
                >
                  <Tag className="h-4 w-4 text-primary flex-shrink-0" />
                  <CardTitle className="text-lg group-hover:underline truncate">
                    {item.tag}
                  </CardTitle>
                </Link>
                {item.follower_count > 0 && (
                  <Badge variant="secondary" className="flex-shrink-0">
                    #{Math.min(tags.indexOf(item) + 1, tags.length)}
                  </Badge>
                )}
              </div>
            </CardHeader>

            <CardContent className="pb-3">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5" />
                  <span className="font-medium text-foreground">
                    {item.gig_count}
                  </span>{" "}
                  {item.gig_count === 1 ? "gig" : "gigs"}
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  <span className="font-medium text-foreground">
                    {item.follower_count}
                  </span>{" "}
                  {item.follower_count === 1 ? "follower" : "followers"}
                </span>
              </div>
            </CardContent>

            <CardFooter>
              {isAuthenticated === false ? (
                <Link href="/login" className="w-full">
                  <Button variant="outline" size="sm" className="w-full gap-2">
                    <LogIn className="h-3.5 w-3.5" />
                    Log in to follow
                  </Button>
                </Link>
              ) : isAuthenticated ? (
                <Button
                  variant={isFollowing ? "outline" : "default"}
                  size="sm"
                  className="w-full gap-2"
                  disabled={isToggling}
                  onClick={() => toggleFollow(item.tag)}
                >
                  {isToggling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : isFollowing ? (
                    <HeartOff className="h-3.5 w-3.5" />
                  ) : (
                    <Heart className="h-3.5 w-3.5" />
                  )}
                  {isToggling
                    ? "..."
                    : isFollowing
                      ? "Unfollow"
                      : "Follow"}
                </Button>
              ) : null}
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
