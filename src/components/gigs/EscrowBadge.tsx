"use client";

interface EscrowBadgeProps {
  variant?: "full" | "compact";
}

export function EscrowBadge({ variant = "full" }: EscrowBadgeProps) {
  return (
    <a
      href="https://coinpayportal.com"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block hover:opacity-80 transition-opacity"
      title="Escrow services available via CoinPayPortal"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="https://coinpayportal.com/badges/escrow-badge.svg"
        alt="Escrow Services Available via CoinPayPortal"
        className={variant === "compact" ? "h-8" : "h-10"}
      />
    </a>
  );
}
