"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import {
  BadgeCheck,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Send,
  Zap,
} from "lucide-react";
import type { VerificationType, VerificationRequest } from "@/types";

interface VerificationSettingsProps {
  verified: boolean;
  verifiedAt: string | null;
  verificationType: VerificationType | null;
  latestRequest: VerificationRequest | null;
}

export function VerificationSettings({
  verified,
  verifiedAt,
  verificationType,
  latestRequest,
}: VerificationSettingsProps) {
  const [evidence, setEvidence] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [currentRequest, setCurrentRequest] = useState(latestRequest);
  const [isVerified, setIsVerified] = useState(verified);

  const handleSubmitRequest = async () => {
    if (!evidence.trim() || evidence.trim().length < 10) {
      setMessage({
        type: "error",
        text: "Please provide at least 10 characters of evidence (portfolio link, GitHub URL, etc.)",
      });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/verification/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidence: evidence.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error });
        return;
      }

      setCurrentRequest(data.request);
      setEvidence("");
      setMessage({
        type: "success",
        text: "Verification request submitted! We'll review it shortly.",
      });
    } catch {
      setMessage({ type: "error", text: "Failed to submit request" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAutoCheck = async () => {
    setChecking(true);
    setMessage(null);

    try {
      const res = await fetch("/api/verification/check", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error });
        return;
      }

      if (data.verified) {
        setIsVerified(true);
        setMessage({
          type: "success",
          text: "🎉 Congratulations! You've been auto-verified!",
        });
      } else if (data.already_verified) {
        setMessage({ type: "success", text: "You're already verified!" });
      } else {
        const criteria = data.criteria;
        const missing: string[] = [];
        if (!criteria.completedGigs.met)
          missing.push(
            `Complete ${criteria.completedGigs.required - criteria.completedGigs.value} more gig(s)`
          );
        if (!criteria.averageRating.met)
          missing.push(
            criteria.averageRating.value === null
              ? "Get at least one review"
              : `Raise rating to ${criteria.averageRating.required}+`
          );
        if (!criteria.accountAge.met)
          missing.push(
            `Wait ${criteria.accountAge.required - criteria.accountAge.value} more day(s)`
          );

        setMessage({
          type: "error",
          text: `Not yet eligible. Still needed: ${missing.join(", ")}`,
        });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to check eligibility" });
    } finally {
      setChecking(false);
    }
  };

  if (isVerified) {
    return (
      <div className="space-y-6">
        {/* Verified status card */}
        <div className="p-6 bg-card rounded-lg border border-green-200 dark:border-green-800/50 bg-green-50/50 dark:bg-green-900/10">
          <div className="flex items-center gap-3 mb-4">
            <VerifiedBadge
              verificationType={verificationType}
              size="lg"
              showLabel
            />
            <h2 className="text-lg font-semibold text-green-700 dark:text-green-400">
              You are verified!
            </h2>
          </div>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>
              <span className="font-medium">Type:</span>{" "}
              {verificationType === "premium"
                ? "Premium Verified"
                : verificationType === "auto"
                  ? "Auto-Verified"
                  : "Manually Verified"}
            </p>
            {verifiedAt && (
              <p>
                <span className="font-medium">Since:</span>{" "}
                {new Date(verifiedAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            )}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Your verified badge is displayed next to your name across the
            platform.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info card */}
      <div className="p-6 bg-card rounded-lg border border-border">
        <div className="flex items-center gap-2 mb-3">
          <BadgeCheck className="h-5 w-5 text-blue-500" />
          <h2 className="text-lg font-semibold">Get Verified</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Verified badges help build trust on the platform. You can get verified
          in two ways:
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="p-4 rounded-lg border border-border bg-muted/30">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-blue-500" />
              <span className="font-medium text-sm">Auto-Verification</span>
              <VerifiedBadge verificationType="auto" size="sm" />
            </div>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Complete 3+ gigs</li>
              <li>• Average rating ≥ 4.0</li>
              <li>• Account age ≥ 7 days</li>
            </ul>
          </div>
          <div className="p-4 rounded-lg border border-border bg-muted/30">
            <div className="flex items-center gap-2 mb-2">
              <Send className="h-4 w-4 text-blue-500" />
              <span className="font-medium text-sm">Manual Review</span>
              <VerifiedBadge verificationType="manual" size="sm" />
            </div>
            <p className="text-xs text-muted-foreground">
              Submit evidence (portfolio, GitHub, etc.) for manual review by our
              team.
            </p>
          </div>
        </div>
      </div>

      {/* Auto-check section */}
      <div className="p-6 bg-card rounded-lg border border-border">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-blue-500" />
          Auto-Verification Check
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Check if you meet all criteria for automatic verification.
        </p>
        <Button onClick={handleAutoCheck} disabled={checking}>
          {checking ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Checking...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4 mr-2" />
              Check Eligibility
            </>
          )}
        </Button>
      </div>

      {/* Manual request section */}
      <div className="p-6 bg-card rounded-lg border border-border">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Send className="h-4 w-4 text-blue-500" />
          Request Manual Verification
        </h3>

        {currentRequest?.status === "pending" ? (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800/50 bg-yellow-50/50 dark:bg-yellow-900/10">
            <Clock className="h-5 w-5 text-yellow-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-sm">
                Request pending review
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Submitted{" "}
                {new Date(currentRequest.created_at).toLocaleDateString(
                  "en-US",
                  {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  }
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Evidence: {currentRequest.evidence}
              </p>
            </div>
          </div>
        ) : currentRequest?.status === "rejected" ? (
          <div className="mb-4">
            <div className="flex items-center gap-3 p-4 rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/10 mb-4">
              <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">
                  Previous request was rejected
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  You can submit a new request with additional evidence.
                </p>
              </div>
            </div>
            <VerificationForm
              evidence={evidence}
              setEvidence={setEvidence}
              onSubmit={handleSubmitRequest}
              submitting={submitting}
            />
          </div>
        ) : (
          <VerificationForm
            evidence={evidence}
            setEvidence={setEvidence}
            onSubmit={handleSubmitRequest}
            submitting={submitting}
          />
        )}
      </div>

      {/* Message */}
      {message && (
        <div
          className={`p-4 rounded-lg border ${
            message.type === "success"
              ? "border-green-200 dark:border-green-800/50 bg-green-50/50 dark:bg-green-900/10"
              : "border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/10"
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === "success" ? (
              <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
            )}
            <p className="text-sm">{message.text}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function VerificationForm({
  evidence,
  setEvidence,
  onSubmit,
  submitting,
}: {
  evidence: string;
  setEvidence: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  return (
    <div className="space-y-3">
      <label className="text-sm text-muted-foreground block">
        Provide links to your portfolio, GitHub, or other evidence of your work:
      </label>
      <textarea
        value={evidence}
        onChange={(e) => setEvidence(e.target.value)}
        placeholder="https://github.com/yourusername&#10;https://yourportfolio.com&#10;Additional context about your work..."
        className="w-full min-h-[120px] px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
      />
      <Button onClick={onSubmit} disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Send className="h-4 w-4 mr-2" />
            Submit Request
          </>
        )}
      </Button>
    </div>
  );
}
