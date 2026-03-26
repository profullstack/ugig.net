"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/testimonials/StarRating";
import { UserCheck, Star } from "lucide-react";

interface HiredWorker {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  application_status: string;
}

interface HiredWorkerReviewProps {
  gigId: string;
  workers: HiredWorker[];
  currentUserId: string;
  existingReviews: Set<string>; // worker profile IDs already reviewed
}

export function HiredWorkerReview({
  gigId,
  workers,
  currentUserId,
  existingReviews,
}: HiredWorkerReviewProps) {
  const [reviewingWorkerId, setReviewingWorkerId] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Set<string>>(new Set(existingReviews));

  if (workers.length === 0) return null;

  const handleSubmit = async (workerId: string) => {
    if (rating === 0) {
      setError("Please select a rating");
      return;
    }
    if (!content.trim()) {
      setError("Please write a review");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/testimonials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: workerId,
          gig_id: gigId,
          rating,
          content: content.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit review");
      }

      setSubmitted((prev) => new Set([...prev, workerId]));
      setReviewingWorkerId(null);
      setRating(0);
      setContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 bg-card rounded-lg border border-border">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <UserCheck className="h-5 w-5 text-green-500" />
        Hired Workers
      </h2>

      <div className="space-y-4">
        {workers.map((worker) => (
          <div key={worker.id} className="flex items-start gap-3">
            <Link href={`/u/${worker.username}`}>
              <Avatar className="h-10 w-10">
                {worker.avatar_url ? (
                  <AvatarImage src={worker.avatar_url} alt={worker.full_name || worker.username} />
                ) : (
                  <AvatarFallback>
                    {(worker.full_name || worker.username).charAt(0).toUpperCase()}
                  </AvatarFallback>
                )}
              </Avatar>
            </Link>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Link
                  href={`/u/${worker.username}`}
                  className="font-medium hover:underline truncate"
                >
                  {worker.full_name || worker.username}
                </Link>
                <Badge variant="secondary" className="text-xs">
                  {worker.application_status === "completed" ? "Completed" : "In Progress"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">@{worker.username}</p>

              {/* Review status / button */}
              {submitted.has(worker.id) ? (
                <p className="text-sm text-green-600 mt-2 flex items-center gap-1">
                  <Star className="h-3 w-3" /> Review submitted
                </p>
              ) : reviewingWorkerId === worker.id ? (
                <div className="mt-3 space-y-3 p-3 bg-muted/30 rounded-lg">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Rating</label>
                    <StarRating rating={rating} size="lg" interactive onRatingChange={setRating} />
                  </div>
                  <div>
                    <Textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder={`How was your experience working with ${worker.full_name || worker.username}?`}
                      rows={3}
                      maxLength={1000}
                    />
                    <p className="text-xs text-muted-foreground mt-1">{content.length}/1000</p>
                  </div>
                  {error && <p className="text-sm text-red-500">{error}</p>}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleSubmit(worker.id)}
                      disabled={submitting || rating === 0 || !content.trim()}
                    >
                      {submitting ? "Submitting..." : "Submit Review"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setReviewingWorkerId(null);
                        setRating(0);
                        setContent("");
                        setError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 gap-1"
                  onClick={() => setReviewingWorkerId(worker.id)}
                >
                  <Star className="h-3 w-3" />
                  Leave Review
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
