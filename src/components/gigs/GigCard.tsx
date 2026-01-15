"use client";

import Link from "next/link";
import { MapPin, Clock, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SaveGigButton } from "./SaveGigButton";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";
import type { Gig, Profile } from "@/types";

interface GigCardProps {
  gig: Gig & {
    poster?: Pick<Profile, "id" | "username" | "full_name" | "avatar_url">;
  };
  showSaveButton?: boolean;
  isSaved?: boolean;
  onSaveChange?: (saved: boolean) => void;
  highlightTags?: string[];
}

export function GigCard({
  gig,
  showSaveButton = false,
  isSaved = false,
  onSaveChange,
  highlightTags = [],
}: GigCardProps) {
  const highlightTagsLower = highlightTags.map((t) => t.toLowerCase());
  const isHighlighted = (tag: string) =>
    highlightTagsLower.includes(tag.toLowerCase());

  // Normalize poster - Supabase can return array or object depending on relation config
  const poster = Array.isArray(gig.poster) ? gig.poster[0] : gig.poster;
  const budgetDisplay =
    gig.budget_type === "fixed"
      ? gig.budget_min && gig.budget_max
        ? `${formatCurrency(gig.budget_min)} - ${formatCurrency(gig.budget_max)}`
        : gig.budget_min
          ? formatCurrency(gig.budget_min)
          : "Budget TBD"
      : gig.budget_min && gig.budget_max
        ? `${formatCurrency(gig.budget_min)} - ${formatCurrency(gig.budget_max)}/hr`
        : "Rate TBD";

  return (
    <Link
      href={`/gigs/${gig.id}`}
      className="block p-6 border border-border rounded-lg shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-200 bg-card"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg truncate">{gig.title}</h3>
          <p className="text-muted-foreground text-sm mt-1 line-clamp-2">
            {gig.description}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {showSaveButton && (
            <SaveGigButton
              gigId={gig.id}
              initialSaved={isSaved}
              onSaveChange={onSaveChange}
            />
          )}
          {poster && (
            <Avatar className="h-10 w-10 ring-2 ring-border">
              <AvatarImage
                src={poster.avatar_url || undefined}
                alt={poster.full_name || poster.username}
              />
              <AvatarFallback>
                {(poster.full_name || poster.username || "?")
                  .charAt(0)
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <Badge variant="secondary" className="font-medium">{gig.category}</Badge>
        {gig.skills_required.slice(0, 4).map((skill) => (
          <Badge
            key={skill}
            variant={isHighlighted(skill) ? "default" : "outline"}
          >
            {skill}
          </Badge>
        ))}
        {gig.skills_required.length > 4 && (
          <Badge variant="outline" className="text-muted-foreground">+{gig.skills_required.length - 4}</Badge>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-border text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <DollarSign className="h-4 w-4" />
          {budgetDisplay}
        </span>
        <span className="flex items-center gap-1.5">
          <MapPin className="h-4 w-4" />
          {gig.location_type.charAt(0).toUpperCase() + gig.location_type.slice(1)}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="h-4 w-4" />
          {formatRelativeTime(gig.created_at)}
        </span>
      </div>
    </Link>
  );
}
