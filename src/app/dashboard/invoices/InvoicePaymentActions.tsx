"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CryptoPaymentBox } from "@/components/payments/CryptoPaymentBox";
import { CheckCircle2, Loader2, RefreshCw, Send, ThumbsUp, XCircle } from "lucide-react";

type InvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "cancelled"
  | "expired"
  | "rejected";

interface InvoicePaymentMetadata {
  payment_address?: string | null;
  amount_crypto?: string | number | null;
  payment_currency?: string | null;
  checkout_url?: string | null;
  expires_at?: string | null;
  replacement_requested_at?: string | null;
  accepted_at?: string | null;
}

interface InvoicePaymentActionsProps {
  invoiceId: string;
  gigId: string;
  applicationId: string;
  amountUsd: number;
  currency: string;
  status: InvoiceStatus;
  payUrl: string | null;
  notes: string | null;
  dueDate: string | null;
  metadata: InvoicePaymentMetadata | null;
}

export function InvoicePaymentActions({
  invoiceId,
  gigId,
  status: initialStatus,
  payUrl: initialPayUrl,
  metadata: initialMetadata,
}: InvoicePaymentActionsProps) {
  const router = useRouter();
  const [status, setStatus] = useState<InvoiceStatus>(initialStatus);
  const [payUrl, setPayUrl] = useState(initialPayUrl);
  const [metadata, setMetadata] = useState<InvoicePaymentMetadata | null>(initialMetadata);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [requestingNew, setRequestingNew] = useState(false);
  const [requestedNew, setRequestedNew] = useState(
    Boolean(initialMetadata?.replacement_requested_at)
  );
  const [rejecting, setRejecting] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(
    initialMetadata?.accepted_at ?? null
  );
  const [canRequestNew, setCanRequestNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const paymentAddress = metadata?.payment_address || null;

  const checkPaymentStatus = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (status !== "sent" || !paymentAddress) return;

      if (!silent) {
        setChecking(true);
        setError(null);
      }

      try {
        const res = await fetch(`/api/gigs/${gigId}/invoice/${invoiceId}/payment-status`, {
          cache: "no-store",
        });
        const json = await res.json();

        if (!res.ok) {
          if (!silent) setError(json.error || "Failed to check payment status");
          return;
        }

        const nextStatus = json.data?.status as InvoiceStatus | undefined;
        if (nextStatus) setStatus(nextStatus);
        if (json.data?.pay_url !== undefined) setPayUrl(json.data.pay_url);
        if (json.data?.metadata) setMetadata(json.data.metadata);

        if (nextStatus === "paid") {
          setStatusMessage("Payment confirmed.");
          router.refresh();
        } else if (nextStatus === "expired") {
          setStatusMessage("Payment request expired.");
          router.refresh();
        } else if (!silent) {
          setStatusMessage("Still waiting for confirmation.");
        }
      } catch {
        if (!silent) setError("Network error. Try again.");
      } finally {
        if (!silent) setChecking(false);
      }
    },
    [gigId, invoiceId, paymentAddress, router, status]
  );

  useEffect(() => {
    if (status !== "sent" || !paymentAddress) return;

    const interval = window.setInterval(() => {
      void checkPaymentStatus({ silent: true });
    }, 5000);

    return () => window.clearInterval(interval);
  }, [checkPaymentStatus, paymentAddress, status]);

  const createPaymentRequest = async () => {
    setSubmitting(true);
    setError(null);
    setStatusMessage(null);
    setCanRequestNew(false);

    try {
      const res = await fetch(`/api/gigs/${gigId}/invoice/${invoiceId}/payment-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();

      if (!res.ok) {
        const message = json.error || "Failed to create payment request";
        setError(message);
        // The worker's CoinPay wallet is missing or no longer connected, so this
        // invoice can't be paid as-is. Offer to ask them for a fresh invoice.
        if (/wallet|coinpay|not connected|receiving/i.test(message)) {
          setCanRequestNew(true);
        }
        return;
      }

      const nextMetadata = json.data?.metadata || {
        payment_address: json.data?.payment_address || null,
        amount_crypto: json.data?.amount_crypto || null,
        payment_currency: json.data?.payment_currency || null,
        checkout_url: json.data?.pay_url || null,
        expires_at: json.data?.expires_at || null,
      };

      setStatus("sent");
      setPayUrl(json.data?.pay_url || null);
      setMetadata(nextMetadata);
      setStatusMessage("Payment request created at the current market rate.");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const requestNewInvoice = async () => {
    setRequestingNew(true);
    setError(null);

    try {
      const res = await fetch(`/api/gigs/${gigId}/invoice/${invoiceId}/request-new`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Failed to request a new invoice");
        return;
      }

      setRequestedNew(true);
      setCanRequestNew(false);
      setStatusMessage("We asked the worker to send a fresh invoice. You'll be notified when it arrives.");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setRequestingNew(false);
    }
  };

  const rejectInvoice = async () => {
    if (
      !window.confirm(
        "Reject this invoice? The sender is notified and it can no longer be paid."
      )
    ) {
      return;
    }
    setRejecting(true);
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/gigs/${gigId}/invoice/${invoiceId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to reject invoice");
        return;
      }
      setStatus("rejected");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setRejecting(false);
    }
  };

  const acceptInvoice = async () => {
    setAccepting(true);
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/gigs/${gigId}/invoice/${invoiceId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to accept invoice");
        return;
      }
      setAcceptedAt(json.data?.accepted_at || new Date().toISOString());
      setStatusMessage("Accepted. The worker was notified you'll pay soon.");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setAccepting(false);
    }
  };

  const rejectButton = (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={rejectInvoice}
      disabled={rejecting || submitting || accepting}
      className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
    >
      {rejecting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <XCircle className="h-4 w-4" />
      )}
      Reject invoice
    </Button>
  );

  // Marks the invoice as accepted so it lands in the "Accepted" queue to be paid
  // quickly. Once accepted, we show a durable confirmation instead of the button.
  const acceptControl = acceptedAt ? (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700">
      <ThumbsUp className="h-4 w-4" />
      Accepted — will be paid soon
    </span>
  ) : (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={acceptInvoice}
      disabled={accepting || rejecting || submitting}
      className="gap-2 border-green-500/30 text-green-700 hover:bg-green-500/10 hover:text-green-700"
    >
      {accepting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ThumbsUp className="h-4 w-4" />
      )}
      Accept
    </Button>
  );

  if (status === "paid") {
    return (
      <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4 text-sm text-green-700">
        <div className="flex items-center gap-2 font-medium">
          <CheckCircle2 className="h-4 w-4" />
          Payment confirmed
        </div>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-600">
        <div className="flex items-center gap-2 font-medium">
          <XCircle className="h-4 w-4" />
          You rejected this invoice
        </div>
      </div>
    );
  }

  if (status === "cancelled" || status === "draft") {
    return null;
  }

  // The payer already asked the worker for a fresh invoice (the old one can't be
  // paid — usually a disconnected wallet). Make that state durable and clear.
  if ((status === "sent" || status === "expired") && requestedNew && !paymentAddress) {
    return (
      <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm">
        <div className="flex items-center gap-2 font-medium text-amber-700">
          <Send className="h-4 w-4" />
          New invoice requested
        </div>
        <p className="text-muted-foreground">
          You asked the worker to send a fresh invoice. This one can&apos;t be
          paid — you&apos;ll be notified when the new one arrives.
        </p>
        {error && <p className="text-destructive">{error}</p>}
        <div>{rejectButton}</div>
      </div>
    );
  }

  if (status === "sent" && paymentAddress) {
    return (
      <div className="space-y-3">
        <CryptoPaymentBox
          title="Invoice payment"
          paymentAddress={paymentAddress}
          amountCrypto={metadata?.amount_crypto}
          paymentCurrency={metadata?.payment_currency}
          expiresAt={metadata?.expires_at}
          compact
        />

        <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Waiting for payment confirmation.
            {statusMessage ? ` ${statusMessage}` : ""}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => checkPaymentStatus()}
            disabled={checking}
            className="gap-2 self-start sm:self-auto"
          >
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Check payment
          </Button>
        </div>

        <div className="flex items-center justify-between gap-2">
          {acceptControl}
          {rejectButton}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <p className="text-sm text-muted-foreground">
        {status === "expired"
          ? "The last payment request expired, but this invoice is still payable. Create a fresh payment request when you're ready to pay."
          : "Create a payment request when you're ready to pay. The crypto amount will be quoted at the current market rate."}
      </p>
      {statusMessage && <p className="text-sm text-green-700">{statusMessage}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {canRequestNew && (
        <p className="text-xs text-muted-foreground">
          The worker&apos;s CoinPay wallet isn&apos;t connected, so this invoice can&apos;t be paid.
          Ask them to send a fresh invoice with a connected wallet.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {acceptControl}
        <Button
          type="button"
          size="sm"
          onClick={createPaymentRequest}
          disabled={submitting || requestingNew || accepting}
          className="gap-2"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Pay now
        </Button>
        {canRequestNew && !requestedNew && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={requestNewInvoice}
            disabled={requestingNew}
            className="gap-2"
          >
            {requestingNew ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Request a new invoice
          </Button>
        )}
        {rejectButton}
      </div>
    </div>
  );
}
