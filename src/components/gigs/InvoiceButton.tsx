"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Loader2,
  ExternalLink,
  CheckCircle2,
  Clock,
  DollarSign,
  Send,
} from "lucide-react";

interface GigInvoice {
  id: string;
  amount_usd: number;
  currency: string;
  status: string;
  pay_url: string | null;
  notes: string | null;
  due_date: string | null;
  created_at: string;
  worker?: { id: string; username: string; full_name?: string };
  poster?: { id: string; username: string; full_name?: string };
}

interface InvoiceButtonProps {
  gigId: string;
  applicationId: string;
  currentUserId: string;
  isPoster: boolean;
  isWorker: boolean;
  budgetAmount: number | null;
}

export function InvoiceButton({
  gigId,
  applicationId,
  currentUserId,
  isPoster,
  isWorker,
  budgetAmount,
}: InvoiceButtonProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [invoices, setInvoices] = useState<GigInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState(budgetAmount?.toString() || "");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");

  // Fetch existing invoices
  useEffect(() => {
    fetch(`/api/gigs/${gigId}/invoice`)
      .then((r) => r.json())
      .then((d) => {
        if (d.data) {
          // Filter to this application's invoices
          const appInvoices = d.data.filter(
            (inv: any) => inv.application_id === applicationId
          );
          setInvoices(appInvoices);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [gigId, applicationId]);

  const handleCreateInvoice = async () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch(`/api/gigs/${gigId}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: applicationId,
          amount: parsedAmount,
          currency: "USD",
          notes: notes || undefined,
          due_date: dueDate || undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to create invoice");
        return;
      }

      // Add to local list
      setInvoices((prev) => [
        {
          id: result.data.invoice_id,
          amount_usd: parsedAmount,
          currency: "USD",
          status: "sent",
          pay_url: result.data.pay_url,
          notes: notes || null,
          due_date: dueDate || null,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setShowForm(false);
      setNotes("");
      setDueDate("");
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" /> Draft
          </Badge>
        );
      case "sent":
        return (
          <Badge className="gap-1 bg-blue-500/10 text-blue-600 border-blue-500/20">
            <Send className="h-3 w-3" /> Sent
          </Badge>
        );
      case "paid":
        return (
          <Badge className="gap-1 bg-green-500/10 text-green-600 border-green-500/20">
            <CheckCircle2 className="h-3 w-3" /> Paid
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="secondary" className="gap-1">
            Cancelled
          </Badge>
        );
      case "expired":
        return (
          <Badge variant="secondary" className="gap-1 text-muted-foreground">
            Expired
          </Badge>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading invoices...
      </div>
    );
  }

  // Show existing invoices
  if (invoices.length > 0) {
    return (
      <div className="space-y-3">
        {invoices.map((inv) => (
          <div
            key={inv.id}
            className="border border-border rounded-lg p-4 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">${inv.amount_usd}</span>
                <span className="text-sm text-muted-foreground">
                  {inv.currency}
                </span>
              </div>
              {statusBadge(inv.status)}
            </div>

            {inv.notes && (
              <p className="text-sm text-muted-foreground">{inv.notes}</p>
            )}

            {/* Poster: show pay link */}
            {isPoster && inv.pay_url && inv.status === "sent" && (
              <a
                href={inv.pay_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Pay Invoice
              </a>
            )}

            {/* Worker: show pay link status */}
            {isWorker && inv.status === "sent" && (
              <p className="text-sm text-blue-600">
                📧 Invoice sent to client. Waiting for payment.
              </p>
            )}

            {inv.status === "paid" && (
              <p className="text-sm text-green-600">
                ✅ Invoice paid!
              </p>
            )}
          </div>
        ))}

        {/* Worker can send another invoice */}
        {isWorker && !showForm && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowForm(true)}
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            Send Another Invoice
          </Button>
        )}

        {isWorker && showForm && (
          <InvoiceForm
            amount={amount}
            setAmount={setAmount}
            notes={notes}
            setNotes={setNotes}
            dueDate={dueDate}
            setDueDate={setDueDate}
            error={error}
            isCreating={isCreating}
            onSubmit={handleCreateInvoice}
            onCancel={() => {
              setShowForm(false);
              setError(null);
            }}
          />
        )}
      </div>
    );
  }

  // Worker: show create invoice button/form
  if (isWorker) {
    if (showForm) {
      return (
        <InvoiceForm
          amount={amount}
          setAmount={setAmount}
          notes={notes}
          setNotes={setNotes}
          dueDate={dueDate}
          setDueDate={setDueDate}
          error={error}
          isCreating={isCreating}
          onSubmit={handleCreateInvoice}
          onCancel={() => {
            setShowForm(false);
            setError(null);
          }}
        />
      );
    }

    return (
      <Button
        onClick={() => setShowForm(true)}
        variant="default"
        className="gap-2"
      >
        <FileText className="h-4 w-4" />
        Send Invoice{budgetAmount ? ` ($${budgetAmount})` : ""}
      </Button>
    );
  }

  // Poster with no invoices yet: nothing to show
  return null;
}

// ── Invoice Form ──

function InvoiceForm({
  amount,
  setAmount,
  notes,
  setNotes,
  dueDate,
  setDueDate,
  error,
  isCreating,
  onSubmit,
  onCancel,
}: {
  amount: string;
  setAmount: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  dueDate: string;
  setDueDate: (v: string) => void;
  error: string | null;
  isCreating: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <p className="font-medium text-sm">Create Invoice</p>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Amount (USD)
        </label>
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
        <label className="text-xs font-medium text-muted-foreground">
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Description of work completed..."
          rows={2}
          className="w-full text-sm border rounded-md px-2 py-1.5 bg-background resize-none"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Due Date (optional)
        </label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="w-full text-sm border rounded-md px-2 py-1.5 bg-background"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button
          onClick={onSubmit}
          disabled={isCreating || !amount}
          className="flex-1"
          size="sm"
        >
          {isCreating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          Send Invoice
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
