"use client";

import Link from "next/link";
import Image from "next/image";
import { MapPin, Clock, DollarSign, Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AgentBadge } from "@/components/ui/AgentBadge";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { SaveGigButton } from "./SaveGigButton";
import { CopyLinkButton } from "@/components/ui/CopyLinkButton";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";
import { linkifyText } from "@/lib/linkify";
import type { Gig, Profile } from "@/types";
import { SatsRangeToUsd } from "./SatsToUsd";
import { ZapButton } from "@/components/zaps/ZapButton";
import { isGigBoosted } from "@/lib/boost";

export type GigCardData = Gig & {
  poster?: Pick<Profile, "id" | "username" | "full_name" | "avatar_url" | "account_type" | "verified" | "verification_type">;
};

interface GigCardProps {
  gig: GigCardData;
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
        case "daily": return "/day";
        case "weekly": return "/wk";
        case "monthly": return "/mo";
        case "yearly": return "/yr";
        case "per_task": return unit ? `/${unit}` : "/task";
        case "per_unit": return unit ? `/${unit}` : "/unit";
        case "revenue_share": return "% rev share";
        case "bounty": return "";
        default: return "";
      }
    })();

    const coin = gig.payment_coin;
    const isSats = coin && (coin === "SATS" || coin === "LN" || coin === "BTC");
    const currencyLabel = coin ? (isSats ? "sats" : coin) : "USD";
    const coinNote = coin ? ` (paid in ${coin})` : "";

    const fmt = (val: number) => {
      if (isSats) return `${val.toLocaleString("en-US")} sats`;
      return `${formatCurrency(val)} USD`;
    };

    if (gig.budget_type === "revenue_share") {
      if (min && max) return `${min}-${max}${suffix}`;
      if (min) return `${min}${suffix}`;
      if (max) return `up to ${max}${suffix}`;
      return "Rev Share TBD";
    }

    if (min && max && min !== max) return `${fmt(min)} - ${fmt(max)}${suffix}${!isSats ? coinNote : ""}`;
    if (min && max) return `${fmt(min)}${suffix}${!isSats ? coinNote : ""}`;
    if (min) return `${fmt(min)}+${suffix}${!isSats ? coinNote : ""}`;
    if (max) return `up to ${fmt(max)}${suffix}${!isSats ? coinNote : ""}`;
    return (gig.budget_type === "fixed" || gig.budget_type === "bounty") ? "Budget TBD" : "Rate TBD";
  };

  const budgetDisplay = getBudgetDisplay();

  const isForHire = gig.listing_type === "for_hire";
  const detailHref = isForHire ? `/for-hire/${gig.id}` : `/gigs/${gig.id}`;
  const boosted = isGigBoosted(gig);

  return (
    <Link
      href={detailHref}
      className={`block p-6 border rounded-lg shadow-sm hover:shadow-md transition-all duration-200 bg-card ${
        boosted
          ? "border-amber-400 ring-1 ring-amber-400/40 hover:border-amber-500"
          : "border-border hover:border-primary/40"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg truncate">{gig.title}</h3>
          <p className="text-muted-foreground text-sm mt-1 line-clamp-2 whitespace-pre-wrap break-words">
            {linkifyText(gig.description || "")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {poster?.verified && (
            <VerifiedBadge verificationType={poster.verification_type} size="sm" />
          )}
          {poster?.account_type === "agent" && (
            <AgentBadge size="sm" />
          )}
          <CopyLinkButton path={detailHref} />
          {showSaveButton && (
            <SaveGigButton
              gigId={gig.id}
              initialSaved={isSaved}
              onSaveChange={onSaveChange}
            />
          )}
          {poster && (
            <div className="flex flex-col items-center gap-1">
              <Image
                src={poster.avatar_url || "/default-avatar.svg"}
                alt={poster.full_name || poster.username || "User"}
                width={40}
                height={40}
                className="h-10 w-10 rounded-full ring-2 ring-border object-cover"
              />
              <span className="text-xs text-muted-foreground truncate max-w-[80px]">
                @{poster.username}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        {boosted && (
          <Badge className="font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 flex items-center gap-1">
            <Rocket className="h-3 w-3" />
            Boosted
          </Badge>
        )}
        {gig.listing_type === "for_hire" ? (
          <Badge className="font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">For Hire</Badge>
        ) : (
          <Badge className="font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Hiring</Badge>
        )}
        {gig.budget_type === "bounty" && (
          <Badge className="font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">🏆 Bounty</Badge>
        )}
        <Badge variant="secondary" className="font-medium">{gig.category}</Badge>
        {gig.skills_required.slice(0, 4).map((skill) => (
          <Link
            key={skill}
            href={isForHire ? `/for-hire?skill=${encodeURIComponent(skill)}` : `/gigs?skill=${encodeURIComponent(skill)}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Badge
              variant={isHighlighted(skill) ? "default" : "outline"}
              className="cursor-pointer hover:bg-primary/10"
            >
              {skill}
            </Badge>
          </Link>
        ))}
        {gig.skills_required.length > 4 && (
          <Badge variant="outline" className="text-muted-foreground">+{gig.skills_required.length - 4}</Badge>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-border text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5 flex-wrap">
          <DollarSign className="h-4 w-4" />
          {budgetDisplay}
          {gig.payment_coin && (gig.payment_coin === "SATS" || gig.payment_coin === "LN" || gig.payment_coin === "BTC") && (gig.budget_min || gig.budget_max) && (
            <SatsRangeToUsd min={gig.budget_min} max={gig.budget_max} />
          )}
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

      {/* Zap */}
      {gig.poster?.id && (
        <div className="mt-3" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          <ZapButton targetType="gig" targetId={gig.id} recipientId={gig.poster.id} />
        </div>
      )}
    </Link>
  );
}
