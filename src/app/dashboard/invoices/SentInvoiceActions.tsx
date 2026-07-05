"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Loader2, RefreshCw, Send } from "lucide-react";

type InvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "cancelled"
  | "expired"
  | "rejected";

interface SentInvoiceActionsProps {
  invoiceId: string;
  gigId: string;
  status: InvoiceStatus;
}

// Sender-side controls on the "Invoices Sent" tab: revoke an invoice you sent
// before it's paid, or resend a corrected one after it was revoked/rejected.
// Resend hands off to the gig page, where the invoice form pre-fills from the
// original (it has the wallet + line-item context this list doesn't).
export function SentInvoiceActions({ invoiceId, gigId, status }: SentInvoiceActionsProps) {
  const router = useRouter();
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRevoke = status === "sent" || status === "draft" || status === "expired";
  const canResend = status === "cancelled" || status === "rejected";

  if (!canRevoke && !canResend) return null;

  const revoke = async () => {
    setRevoking(true);
    setError(null);
    try {
      const res = await fetch(`/api/gigs/${gigId}/invoice/${invoiceId}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to revoke invoice");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {canRevoke && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={revoke}
          disabled={revoking}
          className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          {revoking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Revoke invoice
        </Button>
      )}
      {canResend && (
        <Link
          href={`/gigs/${gigId}`}
          className={buttonVariants({ size: "sm", variant: "outline", className: "gap-2" })}
        >
          <Send className="h-4 w-4" />
          Resend invoice
        </Link>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
