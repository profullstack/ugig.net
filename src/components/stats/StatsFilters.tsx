import Link from "next/link";
import {
  RANGE_OPTIONS,
  type Perspective,
  type RangeKey,
} from "@/lib/stats/productivity";

interface StatsFiltersProps {
  range: RangeKey;
  perspective: Perspective;
}

const PERSPECTIVES: { key: Perspective; label: string; title: string }[] = [
  { key: "spent", label: "Money I spent", title: "Work you paid for" },
  { key: "earned", label: "Money I earned", title: "Work you delivered" },
];

/**
 * One filter row above everything it scopes: every tile, chart and table on the
 * page re-renders against the same slice, so the numbers always agree.
 */
export function StatsFilters({ range, perspective }: StatsFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <div
        className="inline-flex rounded-lg border border-border overflow-hidden"
        role="group"
        aria-label="Time range"
      >
        {RANGE_OPTIONS.map((option) => {
          const selected = option.key === range;
          return (
            <Link
              key={option.key}
              href={`/dashboard/stats?range=${option.key}&view=${perspective}`}
              title={option.title}
              aria-current={selected ? "true" : undefined}
              className={`px-3 py-1.5 text-sm border-r border-border last:border-r-0 transition-colors ${
                selected
                  ? "bg-primary text-primary-foreground font-medium"
                  : "hover:bg-muted"
              }`}
            >
              {option.label}
            </Link>
          );
        })}
      </div>

      <div
        className="inline-flex rounded-lg border border-border overflow-hidden"
        role="group"
        aria-label="Perspective"
      >
        {PERSPECTIVES.map((option) => {
          const selected = option.key === perspective;
          return (
            <Link
              key={option.key}
              href={`/dashboard/stats?range=${range}&view=${option.key}`}
              title={option.title}
              aria-current={selected ? "true" : undefined}
              className={`px-3 py-1.5 text-sm border-r border-border last:border-r-0 transition-colors ${
                selected
                  ? "bg-primary text-primary-foreground font-medium"
                  : "hover:bg-muted"
              }`}
            >
              {option.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
