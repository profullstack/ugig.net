"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Clock, DollarSign, Copy } from "lucide-react";

interface Question {
  id: string;
  type: "short_text" | "long_text" | "multiple_choice";
  label: string;
  required: boolean;
  options?: string[];
}

interface Submission {
  id: string;
  submitter_id: string;
  answers: { question_id: string; value: string | string[] }[];
  status: "pending" | "approved" | "rejected";
  payout_status: "unpaid" | "invoiced" | "paid";
  review_notes: string | null;
  reviewed_at: string | null;
  pay_url: string | null;
  payment_metadata?: PaymentDetails | null;
  created_at: string;
  submitter: {
    id: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface PaymentDetails {
  payment_address?: string | null;
  amount_crypto?: number | string | null;
  payment_currency?: string | null;
  expires_at?: string | null;
}

interface ReviewPanelProps {
  bountyId: string;
  payoutUsd: number;
  questions: Question[];
  submissions: Submission[];
}

export function ReviewPanel({ bountyId, payoutUsd, questions, submissions }: ReviewPanelProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentDetailsById, setPaymentDetailsById] = useState<Record<string, PaymentDetails>>({});

  const questionLabel = (qid: string) => questions.find((q) => q.id === qid)?.label || qid;

  const review = async (sid: string, status: "approved" | "rejected") => {
    setError(null);
    setBusyId(sid);
    try {
      const res = await fetch(`/api/bounties/${bountyId}/submissions/${sid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed");
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const pay = async (sid: string) => {
    setError(null);
    setBusyId(sid);
    try {
      const res = await fetch(`/api/bounties/${bountyId}/submissions/${sid}/pay`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to create payment link");
        return;
      }
      setPaymentDetailsById((cur) => ({
        ...cur,
        [sid]: {
          payment_address: json.data?.payment_address || null,
          amount_crypto: json.data?.amount_crypto || null,
          payment_currency: json.data?.payment_currency || null,
          expires_at: json.data?.expires_at || null,
        },
      }));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const pending = submissions.filter((s) => s.status === "pending");
  const reviewed = submissions.filter((s) => s.status !== "pending");

  if (submissions.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
        No submissions yet.
      </div>
    );
  }

  const renderCard = (s: Submission) => {
    const name = s.submitter?.full_name || s.submitter?.username || "Unknown";
    const paymentDetails = paymentDetailsById[s.id] || s.payment_metadata || null;
    return (
      <div key={s.id} className="p-4 bg-card border border-border rounded-lg space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">{name}</p>
            <p className="text-xs text-muted-foreground">
              Submitted {new Date(s.created_at).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {s.status === "pending" && (
              <Badge variant="secondary" className="gap-1">
                <Clock className="h-3 w-3" /> Pending
              </Badge>
            )}
            {s.status === "approved" && (
              <Badge className="gap-1 bg-green-500/10 text-green-600 border-green-500/20">
                <CheckCircle2 className="h-3 w-3" /> Approved
              </Badge>
            )}
            {s.status === "rejected" && (
              <Badge variant="secondary" className="gap-1 text-destructive">
                <XCircle className="h-3 w-3" /> Rejected
              </Badge>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {s.answers.map((a, i) => (
            <div key={i}>
              <p className="text-xs font-medium text-muted-foreground">
                {questionLabel(a.question_id)}
              </p>
              <p className="text-sm whitespace-pre-wrap">
                {Array.isArray(a.value) ? a.value.join(", ") : a.value || "—"}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
          {s.status === "pending" && (
            <>
              <Button
                size="sm"
                disabled={busyId === s.id}
                onClick={() => review(s.id, "approved")}
                className="gap-1"
              >
                {busyId === s.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === s.id}
                onClick={() => review(s.id, "rejected")}
                className="gap-1"
              >
                <XCircle className="h-3 w-3" />
                Reject
              </Button>
            </>
          )}

          {s.status === "approved" && s.payout_status === "unpaid" && (
            <Button
              size="sm"
              disabled={busyId === s.id}
              onClick={() => pay(s.id)}
              className="gap-1"
            >
              {busyId === s.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <DollarSign className="h-3 w-3" />
              )}
              Pay ${payoutUsd}
            </Button>
          )}

          {s.status === "approved" &&
            s.payout_status === "invoiced" &&
            paymentDetails?.payment_address && (
              <div className="w-full rounded-md border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Payment address</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={() =>
                      navigator.clipboard?.writeText(paymentDetails.payment_address || "")
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
                  Send{" "}
                  {paymentDetails.amount_crypto
                    ? `${paymentDetails.amount_crypto} ${
                        paymentDetails.payment_currency || ""
                      }`.trim()
                    : paymentDetails.payment_currency || "the selected coin"}{" "}
                  to this address.
                </p>
                {paymentDetails.expires_at && (
                  <p className="text-xs text-muted-foreground">
                    Expires {new Date(paymentDetails.expires_at).toLocaleString()}
                  </p>
                )}
              </div>
            )}

          {s.status === "approved" &&
            s.payout_status === "invoiced" &&
            !paymentDetails?.payment_address && (
              <p className="text-sm text-muted-foreground">
                Payment was prepared, but in-app payment details are not available. Create a new
                payment request if this one expired.
              </p>
            )}

          {s.payout_status === "paid" && (
            <Badge className="gap-1 bg-green-500/10 text-green-600 border-green-500/20">
              <CheckCircle2 className="h-3 w-3" /> Paid
            </Badge>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 text-muted-foreground">
            Awaiting review ({pending.length})
          </h3>
          <div className="space-y-3">{pending.map(renderCard)}</div>
        </div>
      )}

      {reviewed.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 text-muted-foreground">
            Reviewed ({reviewed.length})
          </h3>
          <div className="space-y-3">{reviewed.map(renderCard)}</div>
        </div>
      )}
    </div>
  );
}
