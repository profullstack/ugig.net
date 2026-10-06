"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { gigs as gigsApi } from "@/lib/api";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useDialog } from "@/components/providers/DialogProvider";

interface MarkFilledButtonProps {
  gigId: string;
  status: "draft" | "active" | "paused" | "closed" | "filled" | "archived";
  hiredCount: number;
}

/**
 * "Mark as Filled" on the gig page's owner card, shown once someone is hired.
 *
 * Filling used to live only in the /dashboard/gigs overflow menu, and no gig
 * in prod had ever been filled (2026-10-06), which also left auto-verification
 * and "completed gigs" with nothing to count.
 */
export function MarkFilledButton({ gigId, status, hiredCount }: MarkFilledButtonProps) {
  const { confirm } = useDialog();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (hiredCount < 1 || (status !== "active" && status !== "paused")) {
    return null;
  }

  const handleFill = async () => {
    const ok = await confirm(
      `Mark this gig as filled? You hired ${hiredCount} ${hiredCount === 1 ? "person" : "people"}. It will stop accepting applications.`
    );
    if (!ok) return;

    setIsLoading(true);
    setError(null);

    const result = await gigsApi.updateStatus(gigId, "filled");

    if (result?.error) {
      setError(result.error);
      setIsLoading(false);
      return;
    }

    router.refresh();
  };

  return (
    <div className="space-y-2">
      <Button className="w-full gap-2" onClick={handleFill} disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Marking filled...
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4" />
            Mark as Filled
          </>
        )}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
