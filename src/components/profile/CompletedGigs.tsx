"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/testimonials/StarRating";
import { CheckCircle2, Star, Briefcase, DollarSign } from "lucide-react";

interface CompletedGig {
  id: string;
  gig_id: string;
  gig_title: string;
  gig_budget_type: string;
  gig_budget_min: number | null;
  poster_username: string;
  poster_full_name: string | null;
  completed_at: string;
}

interface CompletedGigsProps {
  profileId: string;
  profileUsername: string;
  gigs: CompletedGig[];
  currentUserId: string | null;
  isOwnProfile: boolean;
  existingTestimonialGigIds: Set<string>;
  existingTestimonialsByGigId?: Record<string, { rating: number; content: string; created_at: string }>;
}

export function CompletedGigs({
  profileId,
  profileUsername,
  gigs,
  currentUserId,
  isOwnProfile,
  existingTestimonialGigIds,
  existingTestimonialsByGigId = {},
}: CompletedGigsProps) {
  const [reviewingGigId, setReviewingGigId] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Set<string>>(new Set(existingTestimonialGigIds));
  const [testimonialByGig, setTestimonialByGig] = useState(existingTestimonialsByGigId);

  if (gigs.length === 0) return null;

  const handleSubmit = async (gigId: string) => {
    if (rating === 0) {
      setError("Please select a rating");
      return;
    }
    if (!content.trim()) {
      setError("Please write a testimonial");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/testimonials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: profileId,
          gig_id: gigId,
          rating,
          content: content.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit testimonial");
      }

      setSubmitted((prev) => new Set([...prev, gigId]));
      setTestimonialByGig((prev) => ({
        ...prev,
        [gigId]: {
          rating,
          content: content.trim(),
          created_at: new Date().toISOString(),
        },
      }));
      setReviewingGigId(null);
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
        <CheckCircle2 className="h-5 w-5 text-green-500" />
        Completed Gigs
        <span className="text-sm font-normal text-muted-foreground">({gigs.length})</span>
      </h2>

      <div className="space-y-4">
        {gigs.map((gig) => (
          <div key={gig.id} className="border border-border rounded-lg p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <Link
                  href={`/gigs/${gig.gig_id}`}
                  className="font-medium hover:underline flex items-center gap-2"
                >
                  <Briefcase className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  {gig.gig_title}
                </Link>
                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                  <span>
                    for{" "}
                    <Link href={`/u/${gig.poster_username}`} className="hover:underline">
                      {gig.poster_full_name || gig.poster_username}
                    </Link>
                  </span>
                  {gig.gig_budget_min && (
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      {gig.gig_budget_min}
                    </span>
                  )}
                  <span>{new Date(gig.completed_at).toLocaleDateString()}</span>
                </div>
              </div>
              <Badge className="bg-green-500/10 text-green-600 border-green-500/20 flex-shrink-0">
                Completed
              </Badge>
            </div>

            {/* Testimonial section */}
            {currentUserId && !isOwnProfile && (
              <>
                {submitted.has(gig.gig_id) ? (
                  <div className="mt-3 p-3 bg-muted/30 rounded-lg space-y-2">
                    <p className="text-sm text-green-600 flex items-center gap-1">
                      <Star className="h-3 w-3" /> Testimonial submitted
                    </p>
                    {testimonialByGig[gig.gig_id] && (
                      <>
                        <StarRating rating={testimonialByGig[gig.gig_id].rating} size="sm" />
                        <p className="text-sm text-foreground whitespace-pre-wrap">
                          {testimonialByGig[gig.gig_id].content}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(testimonialByGig[gig.gig_id].created_at).toLocaleDateString()}
                        </p>
                      </>
                    )}
                  </div>
                ) : reviewingGigId === gig.gig_id ? (
                  <div className="mt-3 space-y-3 p-3 bg-muted/30 rounded-lg">
                    <div>
                      <label className="text-sm text-muted-foreground mb-1 block">Rating</label>
                      <StarRating rating={rating} size="lg" interactive onRatingChange={setRating} />
                    </div>
                    <div>
                      <Textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder={`How did ${profileUsername} do on this gig?`}
                        rows={3}
                        maxLength={1000}
                      />
                      <p className="text-xs text-muted-foreground mt-1">{content.length}/1000</p>
                    </div>
                    {error && <p className="text-sm text-red-500">{error}</p>}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleSubmit(gig.gig_id)}
                        disabled={submitting || rating === 0 || !content.trim()}
                      >
                        {submitting ? "Submitting..." : "Submit Testimonial"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setReviewingGigId(null);
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
                    className="mt-3 gap-1"
                    onClick={() => setReviewingGigId(gig.gig_id)}
                  >
                    <Star className="h-3 w-3" />
                    Leave Testimonial
                  </Button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
