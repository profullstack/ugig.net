/**
 * Productivity-vs-cost aggregation.
 *
 * Both sides of the ratio come from work that was actually paid for:
 *   cost  = dollars that changed hands (paid invoices, paid bounty submissions)
 *   units = the quantity billed on those line items ("PRs merged: 4 x $2.00" -> 4)
 *
 * A paid bounty submission has no line items, so it counts as one unit at the
 * bounty's payout. Everything here is pure and UTC-based so it is testable and
 * renders identically on the server and the client.
 */

export type Perspective = "spent" | "earned";

export type RangeKey = "7d" | "30d" | "90d" | "6m" | "12m" | "ytd" | "all";

export type BucketSize = "day" | "week" | "month";

export interface WorkEvent {
  /** ISO timestamp of when the money moved. */
  at: string;
  costUsd: number;
  units: number;
  /** Line-item description, or the bounty title. */
  label: string;
  source: "invoice" | "bounty";
}

export interface SeriesPoint {
  /** UTC bucket start, YYYY-MM-DD. Stable key for React and for tests. */
  key: string;
  /** Short axis tick label. */
  label: string;
  /** Full human range, for tooltips and the table view. */
  rangeLabel: string;
  costUsd: number;
  units: number;
  /** costUsd / units, or null when nothing was delivered in the bucket. */
  costPerUnit: number | null;
}

export interface Totals {
  costUsd: number;
  units: number;
  /** Number of paid line items / bounties. */
  items: number;
  costPerUnit: number | null;
}

export interface BreakdownRow {
  label: string;
  costUsd: number;
  units: number;
  costPerUnit: number | null;
  items: number;
}

export const RANGE_OPTIONS: { key: RangeKey; label: string; title: string }[] = [
  { key: "7d", label: "7D", title: "Last 7 days" },
  { key: "30d", label: "30D", title: "Last 30 days" },
  { key: "90d", label: "90D", title: "Last 90 days" },
  { key: "6m", label: "6M", title: "Last 6 months" },
  { key: "12m", label: "12M", title: "Last 12 months" },
  { key: "ytd", label: "YTD", title: "Year to date" },
  { key: "all", label: "All", title: "All time" },
];

const DAY_MS = 86_400_000;

export function isRangeKey(value: string | undefined): value is RangeKey {
  return RANGE_OPTIONS.some((o) => o.key === value);
}

export function isPerspective(value: string | undefined): value is Perspective {
  return value === "spent" || value === "earned";
}

/** Bucket width that keeps every range to a readable number of marks. */
export function bucketSizeFor(range: RangeKey): BucketSize {
  switch (range) {
    case "7d":
    case "30d":
      return "day";
    case "90d":
    case "6m":
      return "week";
    default:
      return "month";
  }
}

export interface ResolvedRange {
  /** Inclusive start, or null for "all" (the first event stands in). */
  start: Date | null;
  /** Exclusive end. */
  end: Date;
  /** Start of the equally long window immediately before `start`. */
  previousStart: Date | null;
  bucket: BucketSize;
  label: string;
}

/**
 * `end` is the start of tomorrow (UTC), so today's work is always included.
 */
export function resolveRange(range: RangeKey, now: Date): ResolvedRange {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY_MS
  );
  const bucket = bucketSizeFor(range);
  const label = RANGE_OPTIONS.find((o) => o.key === range)?.title ?? "All time";

  if (range === "all") {
    return { start: null, end, previousStart: null, bucket, label };
  }

  let start: Date;
  if (range === "ytd") {
    start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  } else if (range === "6m") {
    start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, now.getUTCDate())
    );
  } else if (range === "12m") {
    start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, now.getUTCDate())
    );
  } else {
    const days = Number(range.replace("d", ""));
    start = new Date(end.getTime() - days * DAY_MS);
  }

  const span = end.getTime() - start.getTime();
  return {
    start,
    end,
    previousStart: new Date(start.getTime() - span),
    bucket,
    label,
  };
}

/** UTC start of the bucket containing `date`, as YYYY-MM-DD. */
export function bucketStart(date: Date, bucket: BucketSize): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();

  if (bucket === "month") return iso(Date.UTC(y, m, 1));
  if (bucket === "day") return iso(Date.UTC(y, m, d));

  // Week: back up to Monday.
  const utc = Date.UTC(y, m, d);
  const weekday = (new Date(utc).getUTCDay() + 6) % 7;
  return iso(utc - weekday * DAY_MS);
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function parseKey(key: string): [number, number, number] {
  const [y, m, d] = key.split("-").map(Number);
  return [y, m, d];
}

function nextBucket(key: string, bucket: BucketSize): string {
  const [y, m, d] = parseKey(key);
  if (bucket === "month") return iso(Date.UTC(y, m, 1));
  if (bucket === "day") return iso(Date.UTC(y, m - 1, d) + DAY_MS);
  return iso(Date.UTC(y, m - 1, d) + 7 * DAY_MS);
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function tickLabel(key: string, bucket: BucketSize): string {
  const [y, m, d] = parseKey(key);
  if (bucket === "month") return `${MONTHS[m - 1]} '${String(y).slice(2)}`;
  return `${MONTHS[m - 1]} ${d}`;
}

function rangeLabel(key: string, bucket: BucketSize): string {
  const [y, m, d] = parseKey(key);
  if (bucket === "month") return `${MONTHS[m - 1]} ${y}`;
  if (bucket === "day") return `${MONTHS[m - 1]} ${d}, ${y}`;
  const last = new Date(Date.UTC(y, m - 1, d) + 6 * DAY_MS);
  return `${MONTHS[m - 1]} ${d} – ${MONTHS[last.getUTCMonth()]} ${last.getUTCDate()}, ${last.getUTCFullYear()}`;
}

export function withinRange(
  event: WorkEvent,
  start: Date | null,
  end: Date
): boolean {
  const t = Date.parse(event.at);
  if (Number.isNaN(t)) return false;
  if (start && t < start.getTime()) return false;
  return t < end.getTime();
}

export function filterRange(
  events: WorkEvent[],
  start: Date | null,
  end: Date
): WorkEvent[] {
  return events.filter((e) => withinRange(e, start, end));
}

/**
 * Zero-filled series across the whole window, so a gap in the work reads as a
 * gap instead of being closed up by the chart.
 */
export function buildSeries(
  events: WorkEvent[],
  start: Date | null,
  end: Date,
  bucket: BucketSize
): SeriesPoint[] {
  const inRange = filterRange(events, start, end);

  let first = start;
  if (!first) {
    const earliest = inRange.reduce<number | null>((min, e) => {
      const t = Date.parse(e.at);
      return min === null || t < min ? t : min;
    }, null);
    if (earliest === null) return [];
    first = new Date(earliest);
  }

  const totals = new Map<string, { costUsd: number; units: number }>();
  for (const e of inRange) {
    const key = bucketStart(new Date(e.at), bucket);
    const acc = totals.get(key) ?? { costUsd: 0, units: 0 };
    acc.costUsd += e.costUsd;
    acc.units += e.units;
    totals.set(key, acc);
  }

  const points: SeriesPoint[] = [];
  // `end` is exclusive, so the last bucket is the one holding the final instant.
  const lastKey = bucketStart(new Date(end.getTime() - 1), bucket);
  let key = bucketStart(first, bucket);

  // Guard so a pathological span can never render tens of thousands of marks.
  for (let i = 0; i < 1000; i += 1) {
    const acc = totals.get(key) ?? { costUsd: 0, units: 0 };
    points.push({
      key,
      label: tickLabel(key, bucket),
      rangeLabel: rangeLabel(key, bucket),
      costUsd: round2(acc.costUsd),
      units: round2(acc.units),
      costPerUnit: acc.units > 0 ? round2(acc.costUsd / acc.units) : null,
    });
    if (key >= lastKey) break;
    key = nextBucket(key, bucket);
  }

  return points;
}

export function summarize(events: WorkEvent[]): Totals {
  const costUsd = events.reduce((s, e) => s + e.costUsd, 0);
  const units = events.reduce((s, e) => s + e.units, 0);
  return {
    costUsd: round2(costUsd),
    units: round2(units),
    items: events.length,
    costPerUnit: units > 0 ? round2(costUsd / units) : null,
  };
}

/** Signed fraction of change, or null when there is no baseline to compare to. */
export function pctChange(
  current: number | null,
  previous: number | null
): number | null {
  if (current === null || previous === null) return null;
  if (previous === 0) return null;
  return (current - previous) / previous;
}

/**
 * Line items group on a normalized description, so "PRs merged" and
 * "PRs Merged " land in the same row.
 */
export function normalizeLabel(label: string): string {
  const trimmed = label.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : "Unlabeled";
}

function groupKey(label: string): string {
  return normalizeLabel(label).toLowerCase();
}

export function breakdownByLabel(
  events: WorkEvent[],
  limit = 7
): BreakdownRow[] {
  const groups = new Map<string, BreakdownRow>();
  for (const e of events) {
    const key = groupKey(e.label);
    const row = groups.get(key) ?? {
      label: normalizeLabel(e.label),
      costUsd: 0,
      units: 0,
      costPerUnit: null,
      items: 0,
    };
    row.costUsd += e.costUsd;
    row.units += e.units;
    row.items += 1;
    groups.set(key, row);
  }

  const rows = [...groups.values()].sort((a, b) => b.costUsd - a.costUsd);
  const head = rows.slice(0, limit);
  const tail = rows.slice(limit);

  if (tail.length > 0) {
    head.push(
      tail.reduce<BreakdownRow>(
        (acc, r) => ({
          label: `Other (${tail.length})`,
          costUsd: acc.costUsd + r.costUsd,
          units: acc.units + r.units,
          items: acc.items + r.items,
          costPerUnit: null,
        }),
        { label: "Other", costUsd: 0, units: 0, items: 0, costPerUnit: null }
      )
    );
  }

  return head.map((r) => ({
    ...r,
    costUsd: round2(r.costUsd),
    units: round2(r.units),
    costPerUnit: r.units > 0 ? round2(r.costUsd / r.units) : null,
  }));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
