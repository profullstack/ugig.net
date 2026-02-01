"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { UserPlus, UserMinus, Loader2 } from "lucide-react";

interface FollowButtonProps {
  username: string;
  initialFollowing?: boolean;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function FollowButton({
  username,
  initialFollowing,
  variant = "default",
  size = "sm",
  className,
}: FollowButtonProps) {
  const [following, setFollowing] = useState(initialFollowing ?? false);
  const [loading, setLoading] = useState(initialFollowing === undefined);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (initialFollowing !== undefined) {
      setFollowing(initialFollowing);
      setLoading(false);
      return;
    }

    // Check follow status
    fetch(`/api/users/${encodeURIComponent(username)}/follow`)
      .then((res) => res.json())
      .then((data) => {
        setFollowing(data.following ?? false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [username, initialFollowing]);

  const handleToggleFollow = async () => {
    setActionLoading(true);
    try {
      const method = following ? "DELETE" : "POST";
      const res = await fetch(
        `/api/users/${encodeURIComponent(username)}/follow`,
        { method }
      );

      if (res.ok) {
        setFollowing(!following);
      }
    } catch {
      // Silently fail
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <Button variant={variant} size={size} disabled className={className}>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  return (
    <Button
      variant={following ? "outline" : variant}
      size={size}
      onClick={handleToggleFollow}
      disabled={actionLoading}
      className={className}
    >
      {actionLoading ? (
        <Loader2 className="h-4 w-4 animate-spin mr-1" />
      ) : following ? (
        <UserMinus className="h-4 w-4 mr-1" />
      ) : (
        <UserPlus className="h-4 w-4 mr-1" />
      )}
      {following ? "Unfollow" : "Follow"}
    </Button>
  );
}
