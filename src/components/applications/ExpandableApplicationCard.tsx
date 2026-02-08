"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface ExpandableApplicationCardProps {
  header: React.ReactNode;
  children: React.ReactNode;
  applicationId: string;
}

export function ExpandableApplicationCard({
  header,
  children,
  applicationId,
}: ExpandableApplicationCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm opacity-80">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between cursor-pointer hover:bg-muted/50 rounded-lg transition-colors"
        aria-expanded={expanded}
        aria-controls={`app-details-${applicationId}`}
        data-testid={`expand-application-${applicationId}`}
      >
        <div className="flex-1">{header}</div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground ml-2 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground ml-2 shrink-0" />
        )}
      </button>
      {expanded && (
        <div
          id={`app-details-${applicationId}`}
          className="px-4 pb-4 border-t border-border pt-4"
          data-testid={`application-details-${applicationId}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
