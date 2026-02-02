"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FollowTagButtonProps {
  tag: string;
  initialFollowing?: boolean;
  size?: "sm" | "xs";
  className?: string;
}

export function FollowTagButton({
  tag,
  initialFollowing,
  size = "xs",
  className,
}: FollowTagButtonProps) {
  const [following, setFollowing] = useState(initialFollowing ?? false);
  const [loading, setLoading] = useState(initialFollowing === undefined);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (initialFollowing !== undefined) {
      setFollowing(initialFollowing);
      setLoading(false);
      return;
    }

    fetch(`/api/tags/${encodeURIComponent(tag)}/follow`)
      .then((res) => res.json())
      .then((data) => {
        setFollowing(data.following ?? false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tag, initialFollowing]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActionLoading(true);
    try {
      const method = following ? "DELETE" : "POST";
      const res = await fetch(
        `/api/tags/${encodeURIComponent(tag)}/follow`,
        { method }
      );

      if (res.ok) {
        const data = await res.json();
        setFollowing(data.following);
      }
    } catch {
      // Silently fail
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        className={cn("h-5 w-5 p-0", className)}
        onClick={(e) => e.stopPropagation()}
      >
        <Loader2 className="h-3 w-3 animate-spin" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      disabled={actionLoading}
      title={following ? `Unfollow #${tag}` : `Follow #${tag}`}
      className={cn(
        "p-0 transition-all",
        size === "xs" ? "h-5 w-5" : "h-6 w-6",
        following
          ? "text-primary hover:text-destructive"
          : "text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100",
        className
      )}
    >
      {actionLoading ? (
        <Loader2 className={cn(size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5", "animate-spin")} />
      ) : following ? (
        <Check className={size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      ) : (
        <Plus className={size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      )}
    </Button>
  );
}
