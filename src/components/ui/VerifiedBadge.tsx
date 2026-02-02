"use client";

import { BadgeCheck } from "lucide-react";
import type { VerificationType } from "@/types";

interface VerifiedBadgeProps {
  verificationType?: VerificationType | null;
  size?: "sm" | "default" | "lg";
  className?: string;
  showLabel?: boolean;
}

const sizeClasses = {
  sm: "h-3.5 w-3.5",
  default: "h-4 w-4",
  lg: "h-5 w-5",
};

const colorClasses: Record<string, string> = {
  auto: "text-blue-500",
  manual: "text-blue-500",
  premium: "text-amber-500",
};

export function VerifiedBadge({
  verificationType,
  size = "default",
  className = "",
  showLabel = false,
}: VerifiedBadgeProps) {
  if (!verificationType) return null;

  const colorClass = colorClasses[verificationType] || "text-blue-500";
  const iconSize = sizeClasses[size];

  const title =
    verificationType === "premium"
      ? "Premium Verified"
      : verificationType === "auto"
        ? "Auto-Verified"
        : "Verified";

  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`}
      title={title}
    >
      <BadgeCheck
        className={`${iconSize} ${colorClass} fill-current`}
        strokeWidth={2.5}
      />
      {showLabel && (
        <span
          className={`text-xs font-medium ${colorClass} ${
            size === "sm" ? "text-[10px]" : ""
          }`}
        >
          {title}
        </span>
      )}
    </span>
  );
}
