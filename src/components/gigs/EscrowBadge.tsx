"use client";

import { ShieldCheck, ExternalLink } from "lucide-react";

interface EscrowBadgeProps {
  variant?: "full" | "compact";
}

export function EscrowBadge({ variant = "full" }: EscrowBadgeProps) {
  return (
    <div className="border border-primary/20 rounded-lg p-4 bg-primary/5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Escrow Services Available
          </p>
          {variant === "full" && (
            <p className="text-xs text-muted-foreground">
              Need secure payments? Escrow services can be arranged through{" "}
              <a
                href="https://coinpayportal.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                coinpayportal.com
                <ExternalLink className="h-3 w-3" />
              </a>
              . Escrow is not integrated into ugig.net — arrangements are made directly between parties.
            </p>
          )}
          {variant === "compact" && (
            <p className="text-xs text-muted-foreground">
              Secure escrow via{" "}
              <a
                href="https://coinpayportal.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                coinpayportal.com
                <ExternalLink className="h-3 w-3" />
              </a>{" "}
              — arranged between parties.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
