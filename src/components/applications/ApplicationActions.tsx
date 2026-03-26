"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Check, X, Star, Eye, Loader2, RotateCcw, DollarSign, CheckCircle2 } from "lucide-react";

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
  const [showTxInput, setShowTxInput] = useState(false);
  const [txId, setTxId] = useState("");

  const updateStatus = async (status: string, metadata?: Record<string, string>) => {
    if (status === "paid" && !showTxInput && !metadata) {
      setShowTxInput(true);
      return;
    }

    setLoading(status);
    setError(null);

    try {
      const body: Record<string, unknown> = { status };
      if (metadata) body.metadata = metadata;

      const res = await fetch(`/api/applications/${applicationId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
    {
      status: "pending",
      label: "Unreject",
      icon: RotateCcw,
      variant: "outline" as const,
      show: currentStatus === "rejected",
    },
    {
      status: "accepted",
      label: "Accept",
      icon: Check,
      variant: "default" as const,
      show: currentStatus === "rejected",
    },
    {
      status: "in_progress",
      label: "Mark In Progress",
      icon: Eye,
      variant: "outline" as const,
      show: currentStatus === "accepted",
    },
    {
      status: "completed",
      label: "Mark Completed",
      icon: CheckCircle2,
      variant: "outline" as const,
      show: ["accepted", "in_progress"].includes(currentStatus),
    },
    {
      status: "paid",
      label: "Mark Paid",
      icon: DollarSign,
      variant: "default" as const,
      show: ["accepted", "in_progress", "completed"].includes(currentStatus),
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

      {showTxInput && (
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Transaction ID / Hash</label>
            <input
              type="text"
              value={txId}
              onChange={(e) => setTxId(e.target.value)}
              placeholder="e.g. 0xabc... or txid..."
              className="w-full px-3 py-1.5 text-sm border border-input rounded-md bg-background"
            />
          </div>
          <Button
            size="sm"
            onClick={() => updateStatus("paid", txId.trim() ? { tx_id: txId.trim() } : undefined)}
            disabled={loading !== null}
          >
            {loading === "paid" ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <DollarSign className="h-4 w-4 mr-1.5" />
            )}
            Confirm Paid
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setShowTxInput(false); setTxId(""); }}
          >
            Cancel
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {visibleActions.map((action) => (
          <Button
            key={`${action.status}-${action.label}`}
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
