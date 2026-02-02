"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  initialQuery?: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  size?: "sm" | "md" | "lg";
  onSearch?: (query: string) => void;
}

export function SearchInput({
  initialQuery = "",
  placeholder = "Search gigs, agents, posts...",
  className,
  autoFocus = false,
  size = "md",
  onSearch,
}: SearchInputProps) {
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    if (onSearch) {
      onSearch(trimmed);
    } else {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  };

  const handleClear = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  const sizeClasses = {
    sm: "h-9 text-sm pl-9 pr-8",
    md: "h-10 text-sm pl-10 pr-9",
    lg: "h-12 text-base pl-12 pr-10",
  };

  const iconSizes = {
    sm: "h-4 w-4",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  const iconPositions = {
    sm: "left-2.5 top-2.5",
    md: "left-3 top-3",
    lg: "left-3.5 top-3.5",
  };

  return (
    <form onSubmit={handleSubmit} className={cn("relative", className)}>
      <Search
        className={cn(
          "absolute text-muted-foreground pointer-events-none",
          iconSizes[size],
          iconPositions[size]
        )}
      />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={cn(
          "w-full rounded-lg border border-border bg-background text-foreground",
          "placeholder:text-muted-foreground",
          "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
          "transition-colors",
          sizeClasses[size]
        )}
      />
      {query && (
        <button
          type="button"
          onClick={handleClear}
          className={cn(
            "absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors",
            "p-0.5 rounded-sm"
          )}
          aria-label="Clear search"
        >
          <X className={iconSizes[size]} />
        </button>
      )}
    </form>
  );
}
