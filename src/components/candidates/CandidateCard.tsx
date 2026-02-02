import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { AgentBadge } from "@/components/ui/AgentBadge";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { MapPin, DollarSign, CheckCircle, Coins } from "lucide-react";
import type { Profile } from "@/types";

interface CandidateCardProps {
  candidate: Profile;
  highlightTags?: string[];
}

export function CandidateCard({ candidate, highlightTags = [] }: CandidateCardProps) {
  const highlightTagsLower = highlightTags.map((t) => t.toLowerCase());

  const isHighlighted = (tag: string) =>
    highlightTagsLower.includes(tag.toLowerCase());

  return (
    <Link
      href={`/u/${candidate.username}`}
      className="block p-6 bg-card border border-border rounded-lg hover:border-primary/50 hover:shadow-md transition-all"
    >
      <div className="flex gap-4">
        <Image
          src={candidate.avatar_url || "/default-avatar.svg"}
          alt={candidate.full_name || candidate.username || "User"}
          width={64}
          height={64}
          className="h-16 w-16 rounded-full object-cover flex-shrink-0"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-lg">
                {candidate.full_name || candidate.username}
              </h3>
              <p className="text-sm text-muted-foreground">@{candidate.username}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {candidate.verified && (
                <VerifiedBadge verificationType={candidate.verification_type} size="sm" />
              )}
              {candidate.account_type === "agent" && (
                <AgentBadge size="sm" />
              )}
              {candidate.is_available && (
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Available
                </Badge>
              )}
            </div>
          </div>

          {candidate.bio && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
              {candidate.bio}
            </p>
          )}

          {/* Skills */}
          {candidate.skills && candidate.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {candidate.skills.slice(0, 8).map((skill: string) => (
                <Badge
                  key={skill}
                  variant={isHighlighted(skill) ? "default" : "secondary"}
                  className="text-xs"
                >
                  {skill}
                </Badge>
              ))}
              {candidate.skills.length > 8 && (
                <Badge variant="outline" className="text-xs">
                  +{candidate.skills.length - 8} more
                </Badge>
              )}
            </div>
          )}

          {/* AI Tools */}
          {candidate.ai_tools && candidate.ai_tools.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {candidate.ai_tools.slice(0, 5).map((tool: string) => (
                <Badge
                  key={tool}
                  variant={isHighlighted(tool) ? "default" : "outline"}
                  className="text-xs"
                >
                  {tool}
                </Badge>
              ))}
              {candidate.ai_tools.length > 5 && (
                <Badge variant="outline" className="text-xs">
                  +{candidate.ai_tools.length - 5} more
                </Badge>
              )}
            </div>
          )}

          {/* Meta info */}
          <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
            {candidate.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {candidate.location}
              </span>
            )}
            {candidate.rate_type && candidate.rate_amount ? (
              <span className="flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" />
                {candidate.rate_type === "revenue_share"
                  ? `${candidate.rate_amount}% rev share`
                  : candidate.rate_unit
                    ? `$${candidate.rate_amount}/${candidate.rate_unit}`
                    : candidate.rate_type === "hourly"
                      ? `$${candidate.rate_amount}/hr`
                      : `$${candidate.rate_amount}/${candidate.rate_type === "per_task" ? "task" : "unit"}`
                }
              </span>
            ) : candidate.hourly_rate ? (
              <span className="flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" />
                ${candidate.hourly_rate}/hr
              </span>
            ) : null}
            {candidate.preferred_coin && (
              <span className="flex items-center gap-1">
                <Coins className="h-3.5 w-3.5" />
                Prefers {candidate.preferred_coin}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
