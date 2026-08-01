"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Megaphone, Users, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AUDIENCE_LABELS, type BroadcastAudience } from "@/lib/broadcast/audiences";
import { cn } from "@/lib/utils";

const AUDIENCE_HINTS: Record<BroadcastAudience, string> = {
  gig_applicants: "Everyone who applied to any gig you posted.",
  bounty_submitters: "Everyone who submitted to any bounty you created.",
  my_people: "Both groups, de-duplicated.",
  all_users: "Admin only — every registered user on the platform.",
};

type Status = { type: "idle" } | { type: "sending" } | { type: "error"; message: string };

export function BroadcastForm() {
  const router = useRouter();
  const [audiences, setAudiences] = useState<BroadcastAudience[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [maxRecipients, setMaxRecipients] = useState<number | null>(null);
  const [selected, setSelected] = useState<BroadcastAudience | null>(null);
  const [content, setContent] = useState("");
  const [isLoadingCounts, setIsLoadingCounts] = useState(true);
  const [status, setStatus] = useState<Status>({ type: "idle" });

  useEffect(() => {
    fetch("/api/messages/broadcast")
      .then((r) => r.json())
      .then((d) => {
        const list: BroadcastAudience[] = d.audiences ?? [];
        setAudiences(list);
        setCounts(d.counts ?? {});
        setMaxRecipients(d.max_recipients ?? null);
        // Default to the first audience that actually has people in it.
        const firstWithPeople = list.find((a) => (d.counts?.[a] ?? 0) > 0);
        setSelected(firstWithPeople ?? list[0] ?? null);
      })
      .catch(() => setStatus({ type: "error", message: "Failed to load audiences" }))
      .finally(() => setIsLoadingCounts(false));
  }, []);

  const selectedCount = selected ? (counts[selected] ?? 0) : 0;
  const willTruncate = maxRecipients !== null && selectedCount > maxRecipients;
  const canSend =
    !!selected && selectedCount > 0 && content.trim().length > 0 && status.type !== "sending";

  const handleSend = async () => {
    if (!selected || !content.trim()) return;
    setStatus({ type: "sending" });
    try {
      const res = await fetch("/api/messages/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, audience: selected }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: "error", message: data.error || "Failed to send" });
        return;
      }
      router.push(`/dashboard/messages/${data.conversation_id}`);
    } catch {
      setStatus({ type: "error", message: "Failed to send" });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold mb-3">Who should this reach?</h2>

        {isLoadingCounts ? (
          <p className="text-sm text-muted-foreground">Counting recipients…</p>
        ) : audiences.length === 0 ? (
          <p className="text-sm text-muted-foreground">No audiences available on this account.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {audiences.map((audience) => {
              const count = counts[audience] ?? 0;
              const isSelected = selected === audience;
              return (
                <button
                  key={audience}
                  type="button"
                  onClick={() => setSelected(audience)}
                  disabled={count === 0}
                  className={cn(
                    "text-left rounded-lg border p-4 transition-colors",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50",
                    count === 0 && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{AUDIENCE_LABELS[audience]}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                      <Users className="h-3 w-3" />
                      {count}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{AUDIENCE_HINTS[audience]}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">Message</h2>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Ask how things are going, share an update, request feedback…"
          rows={8}
          maxLength={2000}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground">{content.length}/2000</span>
          {status.type === "error" && (
            <span className="text-xs text-destructive">{status.message}</span>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1">
        <p>
          Everyone lands in <strong>one shared thread</strong>, so recipients can see each other and
          replies go to the whole group.
        </p>
        {willTruncate && (
          <p className="flex items-start gap-1.5 text-amber-600 dark:text-amber-500">
            <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
            <span>
              This audience has {selectedCount} people; a single broadcast is capped at{" "}
              {maxRecipients}. The rest will not be messaged.
            </span>
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSend} disabled={!canSend}>
          {status.type === "sending" ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Sending…
            </>
          ) : (
            <>
              <Megaphone className="h-4 w-4 mr-2" />
              Send to {selectedCount} {selectedCount === 1 ? "person" : "people"}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
