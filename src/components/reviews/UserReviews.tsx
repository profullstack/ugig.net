"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StarRating } from "./StarRating";
import { ReviewCard } from "./ReviewCard";
import { reviews as reviewsApi } from "@/lib/api";
import { Loader2, Star } from "lucide-react";
import type { Profile, Gig } from "@/types";

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer: Pick<Profile, "id" | "username" | "full_name" | "avatar_url">;
  gig?: Pick<Gig, "id" | "title"> | null;
}

interface UserReviewsProps {
  username: string;
}

export function UserReviews({ username }: UserReviewsProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState({ average_rating: 0, total_reviews: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const limit = 5;

  useEffect(() => {
    async function fetchReviews() {
      const result = await reviewsApi.getForUser(username, { limit });
      if (!result.error && result.data) {
        const data = result.data as {
          data: Review[];
          summary: { average_rating: number; total_reviews: number };
          pagination: { total: number };
        };
        setReviews(data.data);
        setSummary(data.summary);
        setHasMore(data.data.length < data.pagination.total);
      }
      setIsLoading(false);
    }

    fetchReviews();
  }, [username]);

  const loadMore = async () => {
    setIsLoadingMore(true);
    const result = await reviewsApi.getForUser(username, {
      limit,
      offset: reviews.length,
    });
    if (!result.error && result.data) {
      const data = result.data as {
        data: Review[];
        pagination: { total: number };
      };
      setReviews((prev) => [...prev, ...data.data]);
      setHasMore(reviews.length + data.data.length < data.pagination.total);
    }
    setIsLoadingMore(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
        <div className="flex items-center justify-center h-16 w-16 rounded-full bg-primary/10">
          <Star className="h-8 w-8 text-primary" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-3xl font-bold">
              {summary.average_rating.toFixed(1)}
            </span>
            <StarRating rating={Math.round(summary.average_rating)} size="md" />
          </div>
          <p className="text-sm text-muted-foreground">
            Based on {summary.total_reviews} review
            {summary.total_reviews !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Reviews List */}
      {reviews.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No reviews yet
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}

      {/* Load More */}
      {hasMore && (
        <div className="text-center">
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              "Load more reviews"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
