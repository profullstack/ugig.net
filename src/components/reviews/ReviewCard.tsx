"use client";

import Link from "next/link";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { StarRating } from "./StarRating";
import { formatRelativeTime } from "@/lib/utils";
import type { Profile, Gig } from "@/types";

interface ReviewCardProps {
  review: {
    id: string;
    rating: number;
    comment: string | null;
    created_at: string;
    reviewer: Pick<Profile, "id" | "username" | "full_name" | "avatar_url">;
    gig?: Pick<Gig, "id" | "title"> | null;
  };
  showGig?: boolean;
}

export function ReviewCard({ review, showGig = true }: ReviewCardProps) {
  const reviewerInitials = (
    review.reviewer.full_name ||
    review.reviewer.username ||
    "U"
  )
    .charAt(0)
    .toUpperCase();

  return (
    <div className="p-4 border border-border rounded-lg">
      <div className="flex items-start gap-3">
        <Link href={`/u/${review.reviewer.username}`}>
          <Avatar className="h-10 w-10">
            {review.reviewer.avatar_url ? (
              <AvatarImage
                src={review.reviewer.avatar_url}
                alt={review.reviewer.full_name || review.reviewer.username}
              />
            ) : (
              <AvatarFallback>{reviewerInitials}</AvatarFallback>
            )}
          </Avatar>
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <Link
              href={`/u/${review.reviewer.username}`}
              className="font-medium hover:underline truncate"
            >
              {review.reviewer.full_name || review.reviewer.username}
            </Link>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatRelativeTime(review.created_at)}
            </span>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <StarRating rating={review.rating} size="sm" />
            {showGig && review.gig && (
              <span className="text-xs text-muted-foreground">
                for{" "}
                <Link
                  href={`/gigs/${review.gig.id}`}
                  className="hover:underline"
                >
                  {review.gig.title}
                </Link>
              </span>
            )}
          </div>

          {review.comment && (
            <p className="text-sm text-muted-foreground">{review.comment}</p>
          )}
        </div>
      </div>
    </div>
  );
}
