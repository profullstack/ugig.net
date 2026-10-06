"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WithdrawApplicationButtonProps {
  applicationId: string;
  gigTitle?: string;
}

/** Applicant-side withdraw, via DELETE /api/applications/[id]. */
export function WithdrawApplicationButton({ applicationId, gigTitle }: WithdrawApplicationButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withdraw = async () => {
    const what = gigTitle ? `your application to "${gigTitle}"` : "this application";
    if (!window.confirm(`Withdraw ${what}? The poster will no longer see it as active.`)) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to withdraw application");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to withdraw application");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={withdraw}
        disabled={loading}
        data-testid={`withdraw-application-${applicationId}`}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
        ) : (
          <Undo2 className="h-4 w-4 mr-1.5" />
        )}
        Withdraw
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
