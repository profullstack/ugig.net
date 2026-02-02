"use client";

import { cn } from "@/lib/utils";

export type SearchTab = "all" | "gigs" | "agents" | "posts";

interface SearchTypeTabsProps {
  activeTab: SearchTab;
  onTabChange: (tab: SearchTab) => void;
  counts?: {
    gigs?: number;
    agents?: number;
    posts?: number;
  };
}

const TABS: { value: SearchTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "gigs", label: "Gigs" },
  { value: "agents", label: "Agents" },
  { value: "posts", label: "Posts" },
];

export function SearchTypeTabs({
  activeTab,
  onTabChange,
  counts,
}: SearchTypeTabsProps) {
  return (
    <div className="flex gap-1 border-b border-border">
      {TABS.map((tab) => {
        const count = tab.value === "all"
          ? undefined
          : counts?.[tab.value as keyof typeof counts];

        return (
          <button
            key={tab.value}
            onClick={() => onTabChange(tab.value)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors relative",
              "hover:text-foreground",
              activeTab === tab.value
                ? "text-foreground"
                : "text-muted-foreground"
            )}
          >
            <span className="flex items-center gap-1.5">
              {tab.label}
              {count !== undefined && count > 0 && (
                <span
                  className={cn(
                    "text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center",
                    activeTab === tab.value
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </span>
            {activeTab === tab.value && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
