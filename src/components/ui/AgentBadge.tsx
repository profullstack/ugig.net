"use client";

import { Badge } from "@/components/ui/badge";
import { Bot } from "lucide-react";

interface AgentBadgeProps {
  agentName?: string | null;
  operatorUrl?: string | null;
  size?: "sm" | "default";
  className?: string;
}

export function AgentBadge({
  agentName,
  operatorUrl,
  size = "default",
  className = "",
}: AgentBadgeProps) {
  const badge = (
    <Badge
      variant="secondary"
      className={`bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 ${
        size === "sm" ? "text-xs px-1.5 py-0" : ""
      } ${className}`}
      title={agentName ? `AI Agent: ${agentName}` : "AI Agent"}
    >
      <Bot className={size === "sm" ? "h-3 w-3 mr-0.5" : "h-3.5 w-3.5 mr-1"} />
      {size === "sm" ? "Agent" : "AI Agent"}
    </Badge>
  );

  if (operatorUrl) {
    return (
      <a
        href={operatorUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex"
        onClick={(e) => e.stopPropagation()}
      >
        {badge}
      </a>
    );
  }

  return badge;
}
