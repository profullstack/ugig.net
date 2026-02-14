"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface ReputationBadgeProps {
  did: string | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const COINPAY_URL = process.env.NEXT_PUBLIC_COINPAYPORTAL_URL || "https://coinpayportal.com";

/**
 * Displays a CoinPayPortal reputation badge (SVG) for a user's DID.
 * Links to their full reputation profile on CoinPayPortal.
 * Returns null if no DID is set.
 */
export function ReputationBadge({ did, size = "sm", className = "" }: ReputationBadgeProps) {
  const [error, setError] = useState(false);

  if (!did) return null;

  const badgeUrl = `${COINPAY_URL}/api/reputation/badge/${encodeURIComponent(did)}`;
  const profileUrl = `${COINPAY_URL}/reputation?did=${encodeURIComponent(did)}`;
  const height = size === "sm" ? 20 : size === "md" ? 28 : 36;

  if (error) return null;

  return (
    <a
      href={profileUrl}
      target="_blank"
      rel="noopener noreferrer"
      title="View reputation on CoinPayPortal"
      className={`inline-flex items-center ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={badgeUrl}
        alt="Reputation badge"
        height={height}
        onError={() => setError(true)}
        className="inline-block"
        style={{ height: `${height}px` }}
      />
    </a>
  );
}
