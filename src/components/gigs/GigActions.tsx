"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { gigs as gigsApi } from "@/lib/api";
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Pause,
  Play,
  CheckCircle,
  Loader2,
  XCircle,
  Rocket,
} from "lucide-react";
import Link from "next/link";
import { useDialog } from "@/components/providers/DialogProvider";
import { getBoostEligibility } from "@/lib/boost";

interface GigActionsProps {
  gigId: string;
  status: string;
  createdAt?: string | null;
  boostedAt?: string | null;
}

export function GigActions({ gigId, status, createdAt, boostedAt }: GigActionsProps) {
  const router = useRouter();
  const { confirm, alert } = useDialog();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const boost = getBoostEligibility({ created_at: createdAt, boosted_at: boostedAt });

  const handleStatusChange = async (newStatus: string) => {
    setIsLoading(true);
    setError(null);

    const result = await gigsApi.updateStatus(
      gigId,
      newStatus as "draft" | "active" | "paused" | "closed" | "filled"
    );

    if (result.error) {
      setError(result.error);
      setIsLoading(false);
      return;
    }

    setIsOpen(false);
    setIsLoading(false);
    router.refresh();
  };

  const handleBoost = async () => {
    setIsLoading(true);
    setError(null);

    const result = await gigsApi.boost(gigId);

    setIsOpen(false);
    setIsLoading(false);

    if (result.error) {
      await alert(result.error);
      return;
    }

    await alert(
      "Gig boosted! It's pinned to the top of the listing for the next week."
    );
    router.refresh();
  };

  const handleDelete = async () => {
    if (!await confirm("Are you sure you want to delete this gig? This action cannot be undone.")) {
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await gigsApi.delete(gigId);

    if (result.error) {
      setError(result.error);
      setIsLoading(false);
      return;
    }

    setIsLoading(false);
    router.refresh();
  };

  return (
    <div className="flex items-center gap-2">
      <Link href={`/gigs/${gigId}/edit`}>
        <Button variant="outline" size="sm">
          <Edit className="h-4 w-4" />
        </Button>
      </Link>

      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreHorizontal className="h-4 w-4" />
          )}
        </Button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-lg shadow-lg z-20">
              <div className="p-1">
                {error && (
                  <div className="px-3 py-2 text-xs text-destructive">
                    {error}
                  </div>
                )}

                {status === "draft" && (
                  <button
                    onClick={() => handleStatusChange("active")}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted rounded flex items-center gap-2"
                    disabled={isLoading}
                  >
                    <Play className="h-4 w-4" />
                    Publish Gig
                  </button>
                )}

                {status === "active" && (
                  <>
                    {boost.eligible ? (
                      <button
                        onClick={handleBoost}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted rounded flex items-center gap-2 text-primary"
                        disabled={isLoading}
                      >
                        <Rocket className="h-4 w-4" />
                        Boost Gig
                      </button>
                    ) : (
                      <div className="w-full px-3 py-2 text-left text-xs text-muted-foreground flex items-center gap-2">
                        <Rocket className="h-4 w-4 shrink-0" />
                        <span>
                          Boost available{" "}
                          {boost.nextEligibleAt
                            ? new Date(boost.nextEligibleAt).toLocaleDateString()
                            : "soon"}
                        </span>
                      </div>
                    )}
                    <button
                      onClick={() => handleStatusChange("paused")}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted rounded flex items-center gap-2"
                      disabled={isLoading}
                    >
                      <Pause className="h-4 w-4" />
                      Pause Gig
                    </button>
                    <button
                      onClick={() => handleStatusChange("filled")}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted rounded flex items-center gap-2"
                      disabled={isLoading}
                    >
                      <CheckCircle className="h-4 w-4" />
                      Mark as Filled
                    </button>
                    <button
                      onClick={() => handleStatusChange("closed")}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted rounded flex items-center gap-2"
                      disabled={isLoading}
                    >
                      <XCircle className="h-4 w-4" />
                      Close Gig
                    </button>
                  </>
                )}

                {status === "paused" && (
                  <>
                    <button
                      onClick={() => handleStatusChange("active")}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted rounded flex items-center gap-2"
                      disabled={isLoading}
                    >
                      <Play className="h-4 w-4" />
                      Activate Gig
                    </button>
                    <button
                      onClick={() => handleStatusChange("closed")}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted rounded flex items-center gap-2"
                      disabled={isLoading}
                    >
                      <XCircle className="h-4 w-4" />
                      Close Gig
                    </button>
                  </>
                )}

                {(status === "draft" || status === "active" || status === "paused") && (
                  <div className="border-t border-border my-1" />
                )}

                <button
                  onClick={handleDelete}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted rounded flex items-center gap-2 text-destructive"
                  disabled={isLoading}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Gig
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
