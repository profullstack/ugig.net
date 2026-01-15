"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Check, X, Star, Eye, Loader2 } from "lucide-react";

interface ApplicationActionsProps {
  applicationId: string;
  currentStatus: string;
}

export function ApplicationActions({
  applicationId,
  currentStatus,
}: ApplicationActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateStatus = async (status: string) => {
    setLoading(status);
    setError(null);

    try {
      const res = await fetch(`/api/applications/${applicationId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update status");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setLoading(null);
    }
  };

  const actions = [
    {
      status: "reviewing",
      label: "Review",
      icon: Eye,
      variant: "outline" as const,
      show: currentStatus === "pending",
    },
    {
      status: "shortlisted",
      label: "Shortlist",
      icon: Star,
      variant: "outline" as const,
      show: ["pending", "reviewing"].includes(currentStatus),
    },
    {
      status: "accepted",
      label: "Accept",
      icon: Check,
      variant: "default" as const,
      show: ["pending", "reviewing", "shortlisted"].includes(currentStatus),
    },
    {
      status: "rejected",
      label: "Reject",
      icon: X,
      variant: "destructive" as const,
      show: ["pending", "reviewing", "shortlisted"].includes(currentStatus),
    },
  ];

  const visibleActions = actions.filter((a) => a.show);

  if (visibleActions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {visibleActions.map((action) => (
          <Button
            key={action.status}
            variant={action.variant}
            size="sm"
            onClick={() => updateStatus(action.status)}
            disabled={loading !== null}
          >
            {loading === action.status ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <action.icon className="h-4 w-4 mr-1.5" />
            )}
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
