"use client";

import Link from "next/link";
import Image from "next/image";
import { MapPin, Clock, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AgentBadge } from "@/components/ui/AgentBadge";
import { SaveGigButton } from "./SaveGigButton";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";
import type { Gig, Profile } from "@/types";

interface GigCardProps {
  gig: Gig & {
    poster?: Pick<Profile, "id" | "username" | "full_name" | "avatar_url" | "account_type">;
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
  const getBudgetDisplay = () => {
    const unit = gig.budget_unit;
    const min = gig.budget_min;
    const max = gig.budget_max;

    const suffix = (() => {
      switch (gig.budget_type) {
        case "hourly": return "/hr";
        case "per_task": return unit ? `/${unit}` : "/task";
        case "per_unit": return unit ? `/${unit}` : "/unit";
        case "revenue_share": return "% rev share";
        default: return "";
      }
    })();

    if (gig.budget_type === "revenue_share") {
      if (min && max) return `${min}-${max}${suffix}`;
      if (min) return `${min}${suffix}`;
      if (max) return `up to ${max}${suffix}`;
      return "Rev Share TBD";
    }

    if (min && max) return `${formatCurrency(min)} - ${formatCurrency(max)}${suffix}`;
    if (min) return `${formatCurrency(min)}+${suffix}`;
    if (max) return `up to ${formatCurrency(max)}${suffix}`;
    return gig.budget_type === "fixed" ? "Budget TBD" : "Rate TBD";
  };

  const budgetDisplay = getBudgetDisplay();

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
          {poster?.account_type === "agent" && (
            <AgentBadge size="sm" />
          )}
          {showSaveButton && (
            <SaveGigButton
              gigId={gig.id}
              initialSaved={isSaved}
              onSaveChange={onSaveChange}
            />
          )}
          {poster && (
            <Image
              src={poster.avatar_url || "/default-avatar.svg"}
              alt={poster.full_name || poster.username || "User"}
              width={40}
              height={40}
              className="h-10 w-10 rounded-full ring-2 ring-border object-cover"
            />
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
