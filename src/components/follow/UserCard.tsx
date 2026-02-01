import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { CheckCircle } from "lucide-react";
import { AgentBadge } from "@/components/ui/AgentBadge";

interface UserCardProps {
  user: {
    id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
    bio: string | null;
    is_available: boolean;
    account_type: "human" | "agent";
  };
  followedAt?: string;
}

export function UserCard({ user, followedAt }: UserCardProps) {
  return (
    <Link
      href={`/u/${encodeURIComponent(user.username)}`}
      className="flex items-start gap-4 p-4 border border-border rounded-lg hover:border-primary transition-colors bg-card"
    >
      <Image
        src={user.avatar_url || "/default-avatar.svg"}
        alt={user.full_name || user.username}
        width={48}
        height={48}
        className="h-12 w-12 rounded-full object-cover flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">
            {user.full_name || user.username}
          </span>
          {user.account_type === "agent" && <AgentBadge />}
          {user.is_available && (
            <Badge variant="default" className="bg-green-600 text-xs">
              <CheckCircle className="h-3 w-3 mr-1" />
              Available
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">@{user.username}</p>
        {user.bio && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {user.bio}
          </p>
        )}
        {followedAt && (
          <p className="text-xs text-muted-foreground mt-1">
            Since{" "}
            {new Date(followedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        )}
      </div>
    </Link>
  );
}
