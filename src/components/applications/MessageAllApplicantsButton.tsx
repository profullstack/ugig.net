"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface MessageAllApplicantsButtonProps {
  gigId: string;
  applicantCount: number;
}

export function MessageAllApplicantsButton({
  gigId,
  applicantCount,
}: MessageAllApplicantsButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (isSending) return;
    setOpen(false);
    setError(null);
  };

  const handleSend = async () => {
    if (!content.trim()) {
      setError("Message content is required");
      return;
    }
    setIsSending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/gigs/${gigId}/applications/message-all`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send message");
        return;
      }
      router.push(`/dashboard/messages/${data.conversation_id}`);
    } catch {
      setError("Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={applicantCount === 0}
      >
        <Megaphone className="h-4 w-4 mr-2" />
        Message all applicants
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={close}
        >
          <div
            className="w-full max-w-lg bg-card border border-border rounded-lg shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <h2 className="text-lg font-semibold">Message all applicants</h2>
                <p className="text-sm text-muted-foreground">
                  Sends one message to {applicantCount}{" "}
                  {applicantCount === 1 ? "applicant" : "applicants"} in a shared
                  inbox thread. They&apos;ll be notified by email and in-app.
                </p>
              </div>
              <button
                onClick={close}
                disabled={isSending}
                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your message to all applicants..."
              rows={6}
              maxLength={2000}
              autoFocus
              className="mt-4"
            />

            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-muted-foreground">
                {content.length}/2000
              </span>
              {error && <span className="text-xs text-destructive">{error}</span>}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={close} disabled={isSending}>
                Cancel
              </Button>
              <Button onClick={handleSend} disabled={isSending || !content.trim()}>
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send message"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
