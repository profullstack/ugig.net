"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** PUT /api/applications/bulk-status accepts at most this many ids per call. */
export const BULK_STATUS_MAX = 50;

type BulkStatus = "rejected" | "shortlisted";

interface BulkSelectionContextValue {
  selected: Set<string>;
  toggle: (id: string) => void;
}

const BulkSelectionContext = createContext<BulkSelectionContextValue | null>(null);

export function chunkIds(ids: string[], size = BULK_STATUS_MAX): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

interface BulkApplicationActionsProps {
  /** Ids of the applications that can be selected (the active ones). */
  applicationIds: string[];
  children: ReactNode;
}

/**
 * Multi-select for the poster's applications list: a toolbar with Select all,
 * Shortlist and Reject, plus a checkbox per application (BulkSelectCheckbox).
 * Uses PUT /api/applications/bulk-status in batches of 50.
 */
export function BulkApplicationActions({ applicationIds, children }: BulkApplicationActionsProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<BulkStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectable = useMemo(() => new Set(applicationIds), [applicationIds]);
  const selectedIds = [...selected].filter((id) => selectable.has(id));
  const allSelected = applicationIds.length > 0 && selectedIds.length === applicationIds.length;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(applicationIds));
  };

  const apply = async (status: BulkStatus) => {
    if (selectedIds.length === 0) return;
    if (
      status === "rejected" &&
      !window.confirm(
        `Reject ${selectedIds.length} application${selectedIds.length === 1 ? "" : "s"}? Each applicant will be notified.`
      )
    ) {
      return;
    }

    setLoading(status);
    setError(null);
    try {
      for (const ids of chunkIds(selectedIds)) {
        const res = await fetch("/api/applications/bulk-status", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ application_ids: ids, status }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to update applications");
      }
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update applications");
      router.refresh();
    } finally {
      setLoading(null);
    }
  };

  return (
    <BulkSelectionContext.Provider value={{ selected, toggle }}>
      {applicationIds.length > 1 && (
        <div
          className="sticky top-2 z-10 mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-sm"
          data-testid="bulk-application-actions"
        >
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Select all applications"
              className="h-4 w-4"
            />
            {selectedIds.length > 0 ? `${selectedIds.length} selected` : `Select all (${applicationIds.length})`}
          </label>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={selectedIds.length === 0 || loading !== null}
              onClick={() => apply("shortlisted")}
            >
              {loading === "shortlisted" ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Star className="h-4 w-4 mr-1.5" />
              )}
              Shortlist
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={selectedIds.length === 0 || loading !== null}
              onClick={() => apply("rejected")}
            >
              {loading === "rejected" ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <X className="h-4 w-4 mr-1.5" />
              )}
              Reject
            </Button>
          </div>
          {error && <p className="w-full text-sm text-destructive">{error}</p>}
        </div>
      )}
      {children}
    </BulkSelectionContext.Provider>
  );
}

/** Per-application checkbox; renders nothing outside BulkApplicationActions. */
export function BulkSelectCheckbox({ applicationId, label }: { applicationId: string; label?: string }) {
  const ctx = useContext(BulkSelectionContext);
  if (!ctx) return null;
  return (
    <input
      type="checkbox"
      checked={ctx.selected.has(applicationId)}
      onChange={() => ctx.toggle(applicationId)}
      aria-label={label ? `Select ${label}` : "Select application"}
      data-testid={`select-application-${applicationId}`}
      className="h-4 w-4 mt-4 shrink-0 cursor-pointer"
    />
  );
}
