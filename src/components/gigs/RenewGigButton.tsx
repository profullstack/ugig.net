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
  /** An archived gig (archive-stale cron or the owner): reactivate instead. */
  archived?: boolean;
  /** The gig was a draft when archived, so it goes back to being a draft. */
  restoresToDraft?: boolean;
  size?: "sm" | "default";
  className?: string;
}

/**
 * "Renew for 30 days" for a gig paused by expiry. Shown on the gig page's
 * owner card (anchored #renew, which the expiry email links to) and in
 * /dashboard/gigs.
 */
export function RenewGigButton({
  gigId,
  days,
  expired,
  archived = false,
  restoresToDraft = false,
  size = "default",
  className,
}: RenewGigButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!expired && !archived) return null;

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
        {archived
          ? restoresToDraft
            ? "This draft was archived after 30 days without changes."
            : "This gig was archived. It is not listed until you reactivate it."
          : "This gig expired and was paused. It is not listed until you renew it."}
      </p>
      <Button size={size} className="w-full gap-2" onClick={handleRenew} disabled={isLoading}>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        {archived
          ? restoresToDraft
            ? "Restore draft"
            : `Reactivate for ${days} days`
          : `Renew for ${days} days`}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
