/** Shared layout for the stats charts, in SVG user units. */

export const VB_WIDTH = 720;
export const VB_HEIGHT = 240;
export const PAD_LEFT = 52;
export const PAD_RIGHT = 16;
export const PAD_TOP = 18;
export const PAD_BOTTOM = 34;

export const PLOT_X = PAD_LEFT;
export const PLOT_Y = PAD_TOP;
export const PLOT_WIDTH = VB_WIDTH - PAD_LEFT - PAD_RIGHT;
export const PLOT_HEIGHT = VB_HEIGHT - PAD_TOP - PAD_BOTTOM;

/** Max bar thickness — never fill the band; the leftover is air. */
export const MAX_BAR_WIDTH = 24;
/** The surface gap that separates touching marks. */
export const SURFACE_GAP = 2;

export function bandWidth(count: number): number {
  return count > 0 ? PLOT_WIDTH / count : PLOT_WIDTH;
}

export function bandCenter(index: number, count: number): number {
  return PLOT_X + bandWidth(count) * (index + 0.5);
}

export function barWidth(count: number): number {
  const band = bandWidth(count);
  return Math.max(1, Math.min(MAX_BAR_WIDTH, band - SURFACE_GAP));
}

/** Value -> y, against a clean axis maximum. */
export function yFor(value: number, max: number): number {
  if (max <= 0) return PLOT_Y + PLOT_HEIGHT;
  const clamped = Math.max(0, Math.min(value, max));
  return PLOT_Y + PLOT_HEIGHT - (clamped / max) * PLOT_HEIGHT;
}

/**
 * A column with a rounded cap and square feet at the baseline. The radius
 * collapses on a short bar so the cap never swallows the whole mark.
 */
export function columnPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 4
): string {
  const base = y + height;
  const r = Math.max(0, Math.min(radius, height, width / 2));
  if (r === 0) return `M${x},${base} L${x},${y} L${x + width},${y} L${x + width},${base} Z`;
  return [
    `M${x},${base}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + width - r},${y}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `L${x + width},${base}`,
    "Z",
  ].join(" ");
}

/** Roughly how wide a run of text renders, for tooltip boxes and fit checks. */
export function textWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.58;
}

export interface TooltipBox {
  x: number;
  y: number;
  width: number;
  height: number;
  textX: number;
}

/**
 * Places a tooltip beside an anchor, flipping it inside the plot rather than
 * letting it run off the edge.
 */
export function tooltipBox(
  anchorX: number,
  anchorY: number,
  lines: string[],
  fontSize = 11
): TooltipBox {
  const padding = 8;
  const lineHeight = fontSize + 5;
  const width =
    Math.max(...lines.map((l) => textWidth(l, fontSize))) + padding * 2;
  const height = lines.length * lineHeight + padding * 2 - 4;

  let x = anchorX + 12;
  if (x + width > VB_WIDTH - 4) x = anchorX - 12 - width;
  x = Math.max(4, x);

  let y = anchorY - height - 10;
  if (y < 2) y = anchorY + 14;
  y = Math.min(y, VB_HEIGHT - height - 2);

  return { x, y, width, height, textX: x + padding };
}
