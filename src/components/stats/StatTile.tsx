import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { formatPct } from "@/lib/stats/chart-scale";

/** Which direction of change is the good news for this measure. */
export type GoodDirection = "up" | "down" | "neutral";

interface StatTileProps {
  label: string;
  value: string;
  /** Signed fraction of change vs the comparison window, or null. */
  change: number | null;
  /** Names the window the change is measured against. */
  changeLabel: string;
  goodDirection: GoodDirection;
  hint?: string;
}

export function StatTile({
  label,
  value,
  change,
  changeLabel,
  goodDirection,
  hint,
}: StatTileProps) {
  const direction = change === null || change === 0 ? "flat" : change > 0 ? "up" : "down";

  // The arrow shows the direction; the color only says whether that direction
  // is good, so the meaning never rests on hue alone.
  const tone =
    direction === "flat" || goodDirection === "neutral"
      ? "text-muted-foreground"
      : direction === goodDirection
        ? "text-green-700 dark:text-green-400"
        : "text-red-700 dark:text-red-400";

  const Arrow =
    direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : ArrowRight;

  return (
    <div className="p-5 bg-card rounded-lg border border-border shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold">{value}</p>
      {change === null ? (
        <p className="mt-2 text-xs text-muted-foreground">
          No {changeLabel} to compare
        </p>
      ) : (
        <p className={`mt-2 text-xs flex items-center gap-1 ${tone}`}>
          <Arrow className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {formatPct(change)} vs {changeLabel}
          </span>
        </p>
      )}
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
