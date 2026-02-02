"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Bookmark, ArrowLeft } from "lucide-react";
import { GigCard } from "@/components/gigs/GigCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { savedGigs } from "@/lib/api";
import type { Gig, Profile } from "@/types";

type SavedGig = Gig & {
  saved_id: string;
  saved_at: string;
  poster: Pick<Profile, "id" | "username" | "full_name" | "avatar_url" | "account_type" | "verified" | "verification_type">;
};

export default function SavedGigsPage() {
  const [gigs, setGigs] = useState<SavedGig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSavedGigs() {
      const result = await savedGigs.list();
      if (result.error) {
        setError(result.error);
      } else {
        setGigs((result.data as { gigs: SavedGig[] })?.gigs || []);
      }
      setIsLoading(false);
    }
    fetchSavedGigs();
  }, []);

  const handleUnsave = (gigId: string) => {
    setGigs((prev) => prev.filter((g) => g.id !== gigId));
  };

  if (isLoading) {
    return (
      <div className="container max-w-4xl py-8">
        <div className="flex items-center gap-4 mb-8">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container max-w-4xl py-8">
        <div className="text-center py-12">
          <p className="text-destructive">{error}</p>
          <Button asChild className="mt-4">
            <Link href="/gigs">Browse Gigs</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl">
            <Bookmark className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Saved Gigs</h1>
            <p className="text-sm text-muted-foreground">
              {gigs.length} saved {gigs.length === 1 ? "gig" : "gigs"}
            </p>
          </div>
        </div>
      </div>

      {gigs.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-lg border border-border shadow-sm">
          <div className="p-4 bg-muted/30 rounded-full w-fit mx-auto mb-4">
            <Bookmark className="h-12 w-12 text-muted-foreground/50" />
          </div>
          <h2 className="text-lg font-semibold mb-2">No saved gigs yet</h2>
          <p className="text-muted-foreground mb-6">
            Save gigs you&apos;re interested in to easily find them later
          </p>
          <Button asChild>
            <Link href="/gigs">Browse Gigs</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {gigs.map((gig) => (
            <GigCard
              key={gig.id}
              gig={gig}
              showSaveButton
              isSaved={true}
              onSaveChange={(saved) => {
                if (!saved) handleUnsave(gig.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
