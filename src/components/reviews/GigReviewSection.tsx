"use client";

import { useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { ReviewForm } from "./ReviewForm";
import type { ReviewTargetPerson } from "@/lib/reviews/review-targets";

interface GigReviewSectionProps {
  gigId: string;
  /** People the current user can still review (see getReviewTargets). */
  targets: ReviewTargetPerson[];
}

/**
 * Star-rating review forms on /gigs/[id] for both sides of a hire. Anchored
 * at #review so "Rate @x" notifications land here. Each form disappears once
 * submitted; the server leaves out anyone already reviewed.
 */
export function GigReviewSection({ gigId, targets }: GigReviewSectionProps) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const remaining = targets.filter((t) => !done.has(t.id));

  if (targets.length === 0) return null;

  return (
    <section
      id="review"
      className="p-6 bg-card rounded-lg border border-border scroll-mt-24"
      aria-label="Leave a review"
    >
      <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
        <Star className="h-5 w-5 text-yellow-500" />
        Leave a review
      </h2>
      {remaining.length === 0 ? (
        <p className="text-sm text-green-600" role="status">
          Thanks, your review is posted.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            Your rating shows on their profile.
          </p>
          <div className="space-y-6">
            {remaining.map((person) => (
              <div key={person.id} data-testid={`review-target-${person.id}`}>
                <p className="text-sm text-muted-foreground mb-2">
                  <Link href={`/u/${person.username}`} className="hover:underline">
                    @{person.username}
                  </Link>
                </p>
                <ReviewForm
                  gigId={gigId}
                  revieweeId={person.id}
                  revieweeName={person.full_name || `@${person.username}`}
                  onSuccess={() => setDone((prev) => new Set(prev).add(person.id))}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
