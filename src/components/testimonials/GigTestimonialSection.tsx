"use client";

import { useState } from "react";
import { TestimonialCard } from "./TestimonialCard";
import { TestimonialForm } from "./TestimonialForm";
import { Star, Trash2, Loader2, Pencil } from "lucide-react";

interface Testimonial {
  id: string;
  rating: number;
  content: string;
  created_at: string;
  author_id: string;
  author: {
    username: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

interface GigTestimonialSectionProps {
  gigId: string;
  currentUserId: string | null;
  isGigPoster: boolean;
  initialTestimonials: Testimonial[];
  hasExisting: boolean;
}

export function GigTestimonialSection({
  gigId,
  currentUserId,
  isGigPoster,
  initialTestimonials,
  hasExisting,
}: GigTestimonialSectionProps) {
  const [testimonials, setTestimonials] = useState(initialTestimonials);
  const [submitted, setSubmitted] = useState(hasExisting);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleSuccess = () => {
    setSubmitted(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove your testimonial?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/testimonials/${id}`, { method: "DELETE" });
      if (res.ok) {
        setTestimonials((prev) => prev.filter((t) => t.id !== id));
        setSubmitted(false);
      }
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-6 bg-card rounded-lg border border-border">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Star className="h-5 w-5 text-yellow-400" />
        Testimonials
        {testimonials.length > 0 && (
          <span className="text-sm font-normal text-muted-foreground">
            ({testimonials.length})
          </span>
        )}
      </h2>

      {testimonials.length > 0 ? (
        <div className="space-y-4">
          {testimonials.map((t) =>
            editingId === t.id ? (
              <div key={t.id} className="border border-border rounded-lg p-4">
                <TestimonialForm
                  gigId={gigId}
                  editId={t.id}
                  initialContent={t.content}
                  initialRating={t.rating}
                  onSuccess={() => {
                    setEditingId(null);
                    setTestimonials((prev) => prev.filter((x) => x.id !== t.id));
                    setSubmitted(true);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </div>
            ) : (
              <TestimonialCard
                key={t.id}
                id={t.id}
                rating={t.rating}
                content={t.content}
                createdAt={t.created_at}
                author={t.author}
                actions={
                  currentUserId && t.author_id === currentUserId ? (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setEditingId(t.id)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(t.id)}
                        disabled={deletingId === t.id}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                      >
                        {deletingId === t.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        Remove
                      </button>
                    </div>
                  ) : undefined
                }
              />
            )
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No testimonials yet.{" "}
          {!isGigPoster && currentUserId && !submitted && "Be the first to leave one!"}
        </p>
      )}

      {/* Show form for logged-in non-posters who haven't already submitted */}
      {currentUserId && !isGigPoster && !submitted && (
        <div className="mt-6">
          <TestimonialForm gigId={gigId} onSuccess={handleSuccess} />
        </div>
      )}

      {currentUserId && !isGigPoster && submitted && (
        <div className="mt-4 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
          You&apos;ve already left a testimonial for this gig.
        </div>
      )}
    </div>
  );
}
