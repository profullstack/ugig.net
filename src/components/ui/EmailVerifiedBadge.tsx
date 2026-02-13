"use client";

import { ShieldCheck } from "lucide-react";

interface EmailVerifiedBadgeProps {
  size?: "sm" | "default" | "lg";
  className?: string;
  showLabel?: boolean;
}

const sizeConfig = {
  sm: { icon: "h-3.5 w-3.5", text: "text-xs", padding: "px-1.5 py-0.5 gap-1" },
  default: { icon: "h-4 w-4", text: "text-xs", padding: "px-2 py-0.5 gap-1" },
  lg: { icon: "h-5 w-5", text: "text-sm", padding: "px-2.5 py-1 gap-1.5" },
};

export function EmailVerifiedBadge({
  size = "default",
  className = "",
  showLabel = false,
}: EmailVerifiedBadgeProps) {
  const config = sizeConfig[size];

  return (
    <span
      className={`inline-flex items-center ${config.padding} rounded-full bg-green-500/10 border border-green-500/20 ${className}`}
      title="Email Verified"
    >
      <ShieldCheck
        className={`${config.icon} text-green-500`}
        strokeWidth={2.5}
      />
      <span className={`${config.text} font-medium text-green-600 dark:text-green-400`}>
        {showLabel ? "Email Verified" : "Verified"}
      </span>
    </span>
  );
}
