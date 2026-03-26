"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "./StarRating";

interface TestimonialFormProps {
  profileId?: string;
  gigId?: string;
  editId?: string;
  initialContent?: string;
  initialRating?: number;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function TestimonialForm({ profileId, gigId, editId, initialContent, initialRating, onSuccess, onCancel }: TestimonialFormProps) {
  const isEdit = !!editId;
  const [rating, setRating] = useState(initialRating || 0);
  const [content, setContent] = useState(initialContent || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      if (isEdit) {
        // Edit existing testimonial
        const res = await fetch(`/api/testimonials/${editId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating, content: content.trim() }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to update testimonial");
        }
      } else {
        // Create new testimonial
        const payload: Record<string, unknown> = { rating, content: content.trim() };
        if (gigId) {
          payload.gig_id = gigId;
        } else if (profileId) {
          payload.profile_id = profileId;
        }

        const res = await fetch("/api/testimonials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to submit testimonial");
        }
      }

      setSuccess(true);
      setContent("");
      setRating(0);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-600">
        {isEdit
          ? "Your testimonial has been updated and is pending re-approval."
          : gigId
          ? "Your testimonial has been published. Thank you!"
          : "Your testimonial has been submitted and is pending approval. Thank you!"}
      </div>
    );
  }

  const placeholder = gigId
    ? "Share your experience with this gig..."
    : "Share your experience working with this person...";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-5 bg-card rounded-lg border border-border">
      <h3 className="font-semibold text-sm">{isEdit ? "Edit Testimonial" : "Leave a Testimonial"}</h3>

      <div>
        <label className="text-sm text-muted-foreground mb-1.5 block">Rating</label>
        <StarRating rating={rating} size="lg" interactive onRatingChange={setRating} />
      </div>

      <div>
        <label className="text-sm text-muted-foreground mb-1.5 block">Your testimonial</label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={placeholder}
          rows={4}
          maxLength={1000}
        />
        <p className="text-xs text-muted-foreground mt-1">{content.length}/1000</p>
      </div>

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={submitting || rating === 0 || !content.trim()}>
          {submitting ? (isEdit ? "Updating..." : "Submitting...") : (isEdit ? "Update Testimonial" : "Submit Testimonial")}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
