"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { gigs as gigsApi } from "@/lib/api";
import { Loader2, XCircle } from "lucide-react";
import { useDialog } from "@/components/providers/DialogProvider";

interface CloseGigButtonProps {
  gigId: string;
  status: "draft" | "active" | "paused" | "closed" | "filled";
}

export function CloseGigButton({ gigId, status }: CloseGigButtonProps) {
  const { confirm } = useDialog();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "closed" || status === "filled") {
    return null;
  }

  const handleCloseGig = async () => {
    const ok = await confirm(
      "Archive this gig? It will be marked closed and no longer accept applications."
    );
    if (!ok) return;

    setIsLoading(true);
    setError(null);

    const result = await gigsApi.updateStatus(gigId, "closed");

    if (result?.error) {
      setError(result.error);
      setIsLoading(false);
      return;
    }

    router.refresh();
  };

  return (
    <div className="space-y-2">
      <Button
        variant="destructive"
        className="w-full"
        onClick={handleCloseGig}
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Archiving...
          </>
        ) : (
          <>
            <XCircle className="h-4 w-4 mr-2" />
            Archive Gig
          </>
        )}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
