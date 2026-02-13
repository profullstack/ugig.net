"use client";

import { ShieldCheck } from "lucide-react";

interface EmailVerifiedBadgeProps {
  size?: "sm" | "default" | "lg";
  className?: string;
  showLabel?: boolean;
}

const sizeClasses = {
  sm: "h-3.5 w-3.5",
  default: "h-4 w-4",
  lg: "h-5 w-5",
};

export function EmailVerifiedBadge({
  size = "default",
  className = "",
  showLabel = false,
}: EmailVerifiedBadgeProps) {
  const iconSize = sizeClasses[size];

  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`}
      title="Email Verified"
    >
      <ShieldCheck
        className={`${iconSize} text-green-500`}
        strokeWidth={2.5}
      />
      {showLabel && (
        <span
          className={`text-xs font-medium text-green-500 ${
            size === "sm" ? "text-[10px]" : ""
          }`}
        >
          Verified
        </span>
      )}
    </span>
  );
}
