import Link from "next/link";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { StarRating } from "./StarRating";

interface TestimonialCardProps {
  id: string;
  rating: number;
  content: string;
  createdAt: string;
  author: {
    username: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  status?: string;
  actions?: React.ReactNode;
}

export function TestimonialCard({
  rating,
  content,
  createdAt,
  author,
  status,
  actions,
}: TestimonialCardProps) {
  const displayName = author.full_name || author.username;
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="p-5 bg-card rounded-lg border border-border space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/u/${author.username}`} className="flex-shrink-0">
            <Avatar className="h-9 w-9">
              {author.avatar_url ? (
                <AvatarImage src={author.avatar_url} alt={displayName} />
              ) : (
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              )}
            </Avatar>
          </Link>
          <div className="min-w-0">
            <Link
              href={`/u/${author.username}`}
              className="font-medium text-sm hover:underline truncate block"
            >
              {displayName}
            </Link>
            <div className="flex items-center gap-2">
              <StarRating rating={rating} size="sm" />
              <span className="text-xs text-muted-foreground">
                {new Date(createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
        </div>
        {status && status !== "approved" && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              status === "pending"
                ? "bg-yellow-500/10 text-yellow-600"
                : "bg-red-500/10 text-red-600"
            }`}
          >
            {status}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{content}</p>
      {actions && <div className="flex items-center gap-2 pt-1">{actions}</div>}
    </div>
  );
}
