"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useDialog } from "@/components/providers/DialogProvider";
import type { BountyStatus } from "@/lib/bounties";
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Pause,
  Play,
  XCircle,
  Archive,
  ArchiveRestore,
  Loader2,
} from "lucide-react";

interface BountyActionsProps {
  bountyId: string;
  status: BountyStatus;
  /** Where to go after a delete. Defaults to the bounties dashboard. */
  afterDeleteHref?: string;
  /** Hide the Edit button (the dashboard list keeps the row compact). */
  hideEdit?: boolean;
}

// Creator-only controls for a bounty: pause/resume/close, archive/unarchive
// and delete. Same shape as GigActions so the two marketplaces feel alike.
//
// Archive keeps every submission and payout record and hides the bounty from
// everyone but the creator. Delete is refused by the API once a submission
// has been approved, invoiced or paid; the menu then offers to archive.
export function BountyActions({
  bountyId,
  status,
  afterDeleteHref = "/dashboard/bounties",
  hideEdit = false,
}: BountyActionsProps) {
  const router = useRouter();
  const { confirm, alert } = useDialog();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setStatus = async (next: BountyStatus) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bounties/${bountyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Could not update bounty");
        return;
      }
      setIsOpen(false);
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  };

  const handleArchive = async () => {
    if (
      !(await confirm(
        "Archive this bounty? It disappears from the public list and your active bounties. Submissions and payout records are kept, and you can unarchive it later."
      ))
    ) {
      return;
    }
    await setStatus("archived");
  };

  const handleDelete = async () => {
    if (
      !(await confirm(
        "Delete this bounty? Pending and rejected submissions are deleted with it. This cannot be undone."
      ))
    ) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bounties/${bountyId}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409 && json.archive_instead) {
        setIsOpen(false);
        if (await confirm(`${json.error}\n\nArchive it now?`)) {
          await setStatus("archived");
        }
        return;
      }
      if (!res.ok) {
        setError(json.error || "Could not delete bounty");
        return;
      }
      setIsOpen(false);
      router.push(afterDeleteHref);
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  };

  const item = "w-full px-3 py-2 text-left text-sm hover:bg-muted rounded flex items-center gap-2";

  return (
    <div className="flex items-center gap-2">
      {!hideEdit && (
        <Link href={`/bounties/${bountyId}/edit`}>
          <Button size="sm" variant="outline" className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        </Link>
      )}

      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          disabled={isLoading}
          aria-label="Bounty actions"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreHorizontal className="h-4 w-4" />
          )}
        </Button>

        {isOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
            <div className="absolute right-0 top-full mt-1 w-52 bg-card border border-border rounded-lg shadow-lg z-20">
              <div className="p-1">
                {error && <div className="px-3 py-2 text-xs text-destructive">{error}</div>}

                {status === "open" && (
                  <>
                    <button onClick={() => setStatus("paused")} className={item} disabled={isLoading}>
                      <Pause className="h-4 w-4" />
                      Pause bounty
                    </button>
                    <button onClick={() => setStatus("closed")} className={item} disabled={isLoading}>
                      <XCircle className="h-4 w-4" />
                      Close bounty
                    </button>
                  </>
                )}

                {status === "paused" && (
                  <>
                    <button onClick={() => setStatus("open")} className={item} disabled={isLoading}>
                      <Play className="h-4 w-4" />
                      Resume bounty
                    </button>
                    <button onClick={() => setStatus("closed")} className={item} disabled={isLoading}>
                      <XCircle className="h-4 w-4" />
                      Close bounty
                    </button>
                  </>
                )}

                {status === "closed" && (
                  <button onClick={() => setStatus("open")} className={item} disabled={isLoading}>
                    <Play className="h-4 w-4" />
                    Reopen bounty
                  </button>
                )}

                {status === "archived" ? (
                  <button onClick={() => setStatus("closed")} className={item} disabled={isLoading}>
                    <ArchiveRestore className="h-4 w-4" />
                    Unarchive bounty
                  </button>
                ) : (
                  <button onClick={handleArchive} className={item} disabled={isLoading}>
                    <Archive className="h-4 w-4" />
                    Archive bounty
                  </button>
                )}

                <div className="border-t border-border my-1" />

                <button
                  onClick={handleDelete}
                  className={`${item} text-destructive`}
                  disabled={isLoading}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete bounty
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
