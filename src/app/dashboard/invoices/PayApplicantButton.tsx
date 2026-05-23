"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Copy, DollarSign, Loader2 } from "lucide-react";

interface PayApplicantButtonProps {
  gigId: string;
  applicationId: string;
  suggestedAmount: number | null;
  workerName: string;
}

interface PaymentDetails {
  payment_address: string | null;
  amount_crypto: number | string | null;
  payment_currency: string | null;
  expires_at: string | null;
}

export function PayApplicantButton({
  gigId,
  applicationId,
  suggestedAmount,
  workerName,
}: PayApplicantButtonProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(suggestedAmount?.toString() || "");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(
    null
  );

  const submit = async () => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/gigs/${gigId}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: applicationId,
          amount: parsed,
          currency: "USD",
          notes: notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to create invoice");
        return;
      }
      setPaymentDetails({
        payment_address:
          json.data?.payment_address ??
          json.data?.metadata?.payment_address ??
          null,
        amount_crypto:
          json.data?.amount_crypto ?? json.data?.metadata?.amount_crypto ?? null,
        payment_currency:
          json.data?.payment_currency ??
          json.data?.metadata?.payment_currency ??
          null,
        expires_at:
          json.data?.expires_at ?? json.data?.metadata?.expires_at ?? null,
      });
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (paymentDetails) {
    const amountDue = paymentDetails.amount_crypto
      ? `${paymentDetails.amount_crypto} ${
          paymentDetails.payment_currency || ""
        }`.trim()
      : paymentDetails.payment_currency || "the selected coin";

    return (
      <div className="border border-border rounded-lg p-3 space-y-2 bg-background">
        <div className="flex items-center gap-2 text-sm font-medium text-green-600">
          <CheckCircle2 className="h-4 w-4" />
          Payment details ready for {workerName}
        </div>
        {paymentDetails.payment_address ? (
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Payment address
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={() =>
                  navigator.clipboard?.writeText(
                    paymentDetails.payment_address || ""
                  )
                }
              >
                <Copy className="h-3 w-3" />
                Copy
              </Button>
            </div>
            <code className="block break-all rounded bg-background px-2 py-1.5 text-xs">
              {paymentDetails.payment_address}
            </code>
            <p className="text-xs text-muted-foreground">
              Send {amountDue} to this address.
              {paymentDetails.expires_at
                ? ` Expires ${new Date(paymentDetails.expires_at).toLocaleString()}.`
                : ""}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            The invoice was created, but no in-app payment address was returned.
          </p>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)} className="gap-2">
        <DollarSign className="h-4 w-4" />
        Pay {workerName}
      </Button>
    );
  }

  return (
    <div className="border border-border rounded-lg p-3 space-y-2 bg-background">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Amount (USD)</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          min="0.01"
          step="0.01"
          className="w-full text-sm border rounded-md px-2 py-1.5 bg-background"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What you're paying for"
          className="w-full text-sm border rounded-md px-2 py-1.5 bg-background"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={submitting || !amount} onClick={submit} className="flex-1">
          {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Prepare payment
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
