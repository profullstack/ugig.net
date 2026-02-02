import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgentBadge } from "@/components/ui/AgentBadge";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { MapPin, DollarSign, Coins, CheckCircle } from "lucide-react";
import type { Profile } from "@/types";

interface AgentCardProps {
  agent: Profile;
  highlightTags?: string[];
}

export function AgentCard({ agent, highlightTags = [] }: AgentCardProps) {
  const highlightTagsLower = highlightTags.map((t) => t.toLowerCase());

  const isHighlighted = (tag: string) =>
    highlightTagsLower.includes(tag.toLowerCase());

  return (
    <div className="p-6 bg-card border border-border rounded-lg hover:border-primary/50 hover:shadow-md transition-all">
      <div className="flex gap-4">
        <Link href={`/u/${agent.username}`} className="flex-shrink-0">
          <Image
            src={agent.avatar_url || "/default-avatar.svg"}
            alt={agent.full_name || agent.username || "Agent"}
            width={64}
            height={64}
            className="h-16 w-16 rounded-full object-cover"
          />
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <Link
                href={`/u/${agent.username}`}
                className="hover:underline"
              >
                <h3 className="font-semibold text-lg">
                  {agent.full_name || agent.username}
                </h3>
              </Link>
              <p className="text-sm text-muted-foreground">@{agent.username}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {agent.verified && (
                <VerifiedBadge verificationType={agent.verification_type} size="sm" />
              )}
              <AgentBadge
                agentName={agent.agent_name}
                operatorUrl={agent.agent_operator_url}
                size="sm"
              />
              {agent.is_available && (
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Available
                </Badge>
              )}
            </div>
          </div>

          {agent.bio && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
              {agent.bio}
            </p>
          )}

          {/* Skills */}
          {agent.skills && agent.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {agent.skills.slice(0, 8).map((skill: string) => (
                <Badge
                  key={skill}
                  variant={isHighlighted(skill) ? "default" : "secondary"}
                  className="text-xs"
                >
                  {skill}
                </Badge>
              ))}
              {agent.skills.length > 8 && (
                <Badge variant="outline" className="text-xs">
                  +{agent.skills.length - 8} more
                </Badge>
              )}
            </div>
          )}

          {/* AI Tools */}
          {agent.ai_tools && agent.ai_tools.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {agent.ai_tools.slice(0, 5).map((tool: string) => (
                <Badge
                  key={tool}
                  variant={isHighlighted(tool) ? "default" : "outline"}
                  className="text-xs"
                >
                  {tool}
                </Badge>
              ))}
              {agent.ai_tools.length > 5 && (
                <Badge variant="outline" className="text-xs">
                  +{agent.ai_tools.length - 5} more
                </Badge>
              )}
            </div>
          )}

          {/* Meta info */}
          <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
            {agent.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {agent.location}
              </span>
            )}
            {agent.rate_type && agent.rate_amount ? (
              <span className="flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" />
                {agent.rate_type === "revenue_share"
                  ? `${agent.rate_amount}% rev share`
                  : agent.rate_unit
                    ? `$${agent.rate_amount}/${agent.rate_unit}`
                    : agent.rate_type === "hourly"
                      ? `$${agent.rate_amount}/hr`
                      : `$${agent.rate_amount}/${agent.rate_type === "per_task" ? "task" : "unit"}`
                }
              </span>
            ) : agent.hourly_rate ? (
              <span className="flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" />
                ${agent.hourly_rate}/hr
              </span>
            ) : null}
            {agent.preferred_coin && (
              <span className="flex items-center gap-1">
                <Coins className="h-3.5 w-3.5" />
                Prefers {agent.preferred_coin}
              </span>
            )}
          </div>

          {/* Hire Agent button */}
          <div className="mt-4">
            <Link href={`/u/${agent.username}`}>
              <Button size="sm">Hire Agent</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
