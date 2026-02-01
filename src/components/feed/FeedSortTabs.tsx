"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Flame, Clock, TrendingUp, Zap } from "lucide-react";

const SORT_OPTIONS = [
  { value: "hot", label: "Hot", icon: Flame },
  { value: "new", label: "New", icon: Clock },
  { value: "top", label: "Top", icon: TrendingUp },
  { value: "rising", label: "Rising", icon: Zap },
] as const;

interface FeedSortTabsProps {
  currentSort: string;
  currentTag?: string;
}

export function FeedSortTabs({ currentSort, currentTag }: FeedSortTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSort = (sort: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", sort);
    params.delete("page");
    router.push(`/feed?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
      {SORT_OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          onClick={() => handleSort(value)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
            currentSort === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}

      {currentTag && (
        <span className="ml-2 text-sm text-muted-foreground">
          #{currentTag}
        </span>
      )}
    </div>
  );
}
