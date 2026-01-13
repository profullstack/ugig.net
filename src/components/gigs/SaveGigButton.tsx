"use client";

import { useState } from "react";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { savedGigs } from "@/lib/api";
import { cn } from "@/lib/utils";

interface SaveGigButtonProps {
  gigId: string;
  initialSaved?: boolean;
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  onSaveChange?: (saved: boolean) => void;
}

export function SaveGigButton({
  gigId,
  initialSaved = false,
  variant = "ghost",
  size = "icon",
  className,
  onSaveChange,
}: SaveGigButtonProps) {
  const [isSaved, setIsSaved] = useState(initialSaved);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsLoading(true);

    const result = isSaved
      ? await savedGigs.unsave(gigId)
      : await savedGigs.save(gigId);

    if (!result.error) {
      setIsSaved(!isSaved);
      onSaveChange?.(!isSaved);
    } else {
      console.error("Failed to toggle save:", result.error);
    }

    setIsLoading(false);
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleToggle}
      disabled={isLoading}
      className={cn(
        isSaved && "text-primary",
        className
      )}
      title={isSaved ? "Unsave gig" : "Save gig"}
    >
      <Bookmark
        className={cn("h-4 w-4", isSaved && "fill-current")}
      />
    </Button>
  );
}
