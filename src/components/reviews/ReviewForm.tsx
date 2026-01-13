"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "./StarRating";
import { reviews as reviewsApi } from "@/lib/api";
import { Loader2 } from "lucide-react";

interface ReviewFormProps {
  gigId: string;
  revieweeId: string;
  revieweeName: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ReviewForm({
  gigId,
  revieweeId,
  revieweeName,
  onSuccess,
  onCancel,
}: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (rating === 0) {
      setError("Please select a rating");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await reviewsApi.create({
        gig_id: gigId,
        reviewee_id: revieweeId,
        rating,
        comment: comment.trim() || undefined,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      onSuccess?.();
    } catch {
      setError("Failed to submit review");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h3 className="font-medium mb-2">Rate {revieweeName}</h3>
        <StarRating
          rating={rating}
          interactive
          onChange={setRating}
          size="lg"
        />
        {rating > 0 && (
          <p className="text-sm text-muted-foreground mt-1">
            {rating === 1 && "Poor"}
            {rating === 2 && "Fair"}
            {rating === 3 && "Good"}
            {rating === 4 && "Very Good"}
            {rating === 5 && "Excellent"}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="comment" className="block text-sm font-medium mb-2">
          Review (optional)
        </label>
        <Textarea
          id="comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Share your experience working with this person..."
          rows={4}
          maxLength={2000}
          disabled={isSubmitting}
        />
        <p className="text-xs text-muted-foreground mt-1 text-right">
          {comment.length}/2000
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting || rating === 0}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            "Submit Review"
          )}
        </Button>
      </div>
    </form>
  );
}
