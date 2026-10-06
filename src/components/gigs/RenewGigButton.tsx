"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { gigs as gigsApi } from "@/lib/api";
import { Loader2, RefreshCw } from "lucide-react";

interface RenewGigButtonProps {
  gigId: string;
  /** 30 for a hiring gig, 60 for a for_hire ad (src/lib/limits.ts). */
  days: number;
  /** Only rendered for a gig the expiry cron paused; the page decides. */
  expired: boolean;
  size?: "sm" | "default";
  className?: string;
}

/**
 * "Renew for 30 days" for a gig paused by expiry. Shown on the gig page's
 * owner card (anchored #renew, which the expiry email links to) and in
 * /dashboard/gigs.
 */
export function RenewGigButton({ gigId, days, expired, size = "default", className }: RenewGigButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!expired) return null;

  const handleRenew = async () => {
    setIsLoading(true);
    setError(null);
    const result = await gigsApi.renew(gigId);
    if (result?.error) {
      setError(result.error);
      setIsLoading(false);
      return;
    }
    setIsLoading(false);
    router.refresh();
  };

  return (
    <div id="renew" className={`space-y-2 ${className ?? ""}`}>
      <p className="text-xs text-muted-foreground">
        This gig expired and was paused. It is not listed until you renew it.
      </p>
      <Button size={size} className="w-full gap-2" onClick={handleRenew} disabled={isLoading}>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        Renew for {days} days
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
