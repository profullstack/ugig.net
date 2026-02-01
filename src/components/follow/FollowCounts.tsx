import Link from "next/link";
import { Users } from "lucide-react";

interface FollowCountsProps {
  username: string;
  followersCount: number;
  followingCount: number;
}

export function FollowCounts({
  username,
  followersCount,
  followingCount,
}: FollowCountsProps) {
  return (
    <div className="flex items-center gap-4 text-sm">
      <Link
        href={`/u/${encodeURIComponent(username)}/followers`}
        className="flex items-center gap-1 hover:underline"
      >
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{followersCount}</span>
        <span className="text-muted-foreground">
          {followersCount === 1 ? "follower" : "followers"}
        </span>
      </Link>
      <Link
        href={`/u/${encodeURIComponent(username)}/following`}
        className="flex items-center gap-1 hover:underline"
      >
        <span className="font-medium">{followingCount}</span>
        <span className="text-muted-foreground">following</span>
      </Link>
    </div>
  );
}
