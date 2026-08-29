/**
 * Axis maths for the hand-rolled SVG charts on the stats page. Pure so the
 * ticks can be asserted rather than eyeballed.
 */

/**
 * Rounds a raw maximum up to a clean axis top (1 / 2 / 2.5 / 5 x a power of
 * ten), so ticks land on numbers a reader recognises.
 */
export function niceMax(rawMax: number): number {
  if (!Number.isFinite(rawMax) || rawMax <= 0) return 1;

  const magnitude = 10 ** Math.floor(Math.log10(rawMax));
  const normalized = rawMax / magnitude;

  for (const step of [1, 2, 2.5, 5, 10]) {
    if (normalized <= step) return step * magnitude;
  }
  return 10 * magnitude;
}

/**
 * Evenly spaced ticks from 0 to a clean maximum, inclusive of both ends. Pass
 * `integer` for counted things — half a merged PR is not a readable tick.
 */
export function axisTicks(rawMax: number, count = 4, integer = false): number[] {
  const max = integer ? Math.ceil(niceMax(rawMax)) : niceMax(rawMax);
  let steps = Math.max(1, Math.floor(count));

  if (integer) {
    steps =
      [steps, 5, 4, 3, 2, 1].find((c) => Number.isInteger(max / c)) ?? 1;
  }

  return Array.from({ length: steps + 1 }, (_, i) => (max / steps) * i);
}

/** The axis top the ticks actually reach — charts scale against this. */
export function axisMax(ticks: number[]): number {
  return ticks.length > 0 ? ticks[ticks.length - 1] : 1;
}

/**
 * Every nth tick label, chosen so a long series does not collide on the x axis.
 * Always keeps the first and last positions readable.
 */
export function labelStride(pointCount: number, maxLabels = 8): number {
  if (pointCount <= maxLabels) return 1;
  return Math.ceil(pointCount / maxLabels);
}

export function formatUsd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `$${Math.round(value / 1_000)}K`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (abs >= 100 || Number.isInteger(value)) return `$${Math.round(value)}`;
  return `$${value.toFixed(2)}`;
}

export function formatUnits(value: number): string {
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1_000)}K`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Charts take the *name* of a formatter rather than the function itself: a
 * server component cannot hand a function across the client boundary.
 */
export type ValueFormat = "usd" | "units";

export function formatValue(value: number, format: ValueFormat): string {
  return format === "usd" ? formatUsd(value) : formatUnits(value);
}

export function formatPct(fraction: number): string {
  const pct = fraction * 100;
  const rounded = Math.abs(pct) >= 10 ? Math.round(pct) : Number(pct.toFixed(1));
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}
