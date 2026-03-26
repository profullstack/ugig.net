"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  rating: number;
  maxRating?: number;
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  onRatingChange?: (rating: number) => void;
  className?: string;
}

const sizeMap = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export function StarRating({
  rating,
  maxRating = 5,
  size = "md",
  interactive = false,
  onRatingChange,
  className,
}: StarRatingProps) {
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {Array.from({ length: maxRating }, (_, i) => {
        const starIndex = i + 1;
        const isFilled = starIndex <= rating;
        return (
          <Star
            key={i}
            className={cn(
              sizeMap[size],
              isFilled
                ? "fill-yellow-400 text-yellow-400"
                : "fill-none text-muted-foreground/40",
              interactive && "cursor-pointer hover:text-yellow-400 transition-colors"
            )}
            onClick={
              interactive && onRatingChange
                ? () => onRatingChange(starIndex)
                : undefined
            }
          />
        );
      })}
    </div>
  );
}
