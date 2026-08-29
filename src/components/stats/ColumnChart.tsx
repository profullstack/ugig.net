"use client";

import { useState } from "react";
import {
  axisMax,
  axisTicks,
  formatValue,
  labelStride,
  type ValueFormat,
} from "@/lib/stats/chart-scale";
import {
  PLOT_HEIGHT,
  PLOT_WIDTH,
  PLOT_X,
  PLOT_Y,
  VB_HEIGHT,
  VB_WIDTH,
  bandCenter,
  bandWidth,
  barWidth,
  columnPath,
  textWidth,
  tooltipBox,
  yFor,
} from "./geometry";

export interface ColumnPoint {
  key: string;
  /** Short axis tick. */
  label: string;
  /** Full range, shown in the tooltip. */
  rangeLabel: string;
  value: number;
}

interface ColumnChartProps {
  points: ColumnPoint[];
  /** CSS custom property holding the series color. */
  colorVar: string;
  /** Names the formatter for the axis, the direct label and the tooltip. */
  format: ValueFormat;
  /** What one unit of the value is, e.g. "paid" or "units delivered". */
  valueName: string;
  title: string;
}

export function ColumnChart({
  points,
  colorVar,
  format: formatName,
  valueName,
  title,
}: ColumnChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const format = (value: number) => formatValue(value, formatName);

  const count = points.length;
  const rawMax = points.reduce((m, p) => Math.max(m, p.value), 0);
  // Counted things get whole-number ticks; half a merged PR is not a tick.
  const ticks = axisTicks(rawMax, 4, formatName === "units");
  const max = axisMax(ticks);
  const stride = labelStride(count);
  const band = bandWidth(count);
  const width = barWidth(count);

  // Only the tallest column is direct-labelled; the axis and tooltip carry the
  // rest, so the chart never becomes a field of numbers.
  const peakIndex = rawMax > 0 ? points.findIndex((p) => p.value === rawMax) : -1;

  const activePoint = active !== null ? points[active] : null;
  const tooltipLines = activePoint
    ? [activePoint.rangeLabel, `${format(activePoint.value)} ${valueName}`]
    : [];
  const box = activePoint
    ? tooltipBox(
        bandCenter(active as number, count),
        yFor(activePoint.value, max),
        tooltipLines
      )
    : null;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${VB_WIDTH} ${VB_HEIGHT}`}
        className="w-full h-auto min-w-[480px]"
        role="img"
        aria-label={`${title}. ${count} data points. The table below lists every value.`}
        onMouseLeave={() => setActive(null)}
      >
        {/* Gridlines and value axis */}
        {ticks.map((tick) => {
          const y = yFor(tick, max);
          return (
            <g key={tick}>
              <line
                x1={PLOT_X}
                y1={y}
                x2={PLOT_X + PLOT_WIDTH}
                y2={y}
                stroke="var(--color-border)"
                strokeWidth={1}
              />
              <text
                x={PLOT_X - 8}
                y={y + 3.5}
                textAnchor="end"
                fontSize={10}
                fill="var(--color-muted-foreground)"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {format(tick)}
              </text>
            </g>
          );
        })}

        {/* Columns */}
        {points.map((point, i) => {
          const x = bandCenter(i, count) - width / 2;
          const y = yFor(point.value, max);
          const height = PLOT_Y + PLOT_HEIGHT - y;
          if (height <= 0) return null;
          return (
            <path
              key={point.key}
              d={columnPath(x, y, width, height)}
              fill={`var(${colorVar})`}
              opacity={active === null || active === i ? 1 : 0.55}
            />
          );
        })}

        {/* Direct label on the peak, only when it fits inside the band */}
        {peakIndex >= 0 &&
          textWidth(format(points[peakIndex].value), 10) < band + 8 && (
            <text
              x={bandCenter(peakIndex, count)}
              y={Math.max(PLOT_Y - 4, yFor(points[peakIndex].value, max) - 6)}
              textAnchor="middle"
              fontSize={10}
              fontWeight={600}
              fill="var(--color-foreground)"
            >
              {format(points[peakIndex].value)}
            </text>
          )}

        {/* Baseline */}
        <line
          x1={PLOT_X}
          y1={PLOT_Y + PLOT_HEIGHT}
          x2={PLOT_X + PLOT_WIDTH}
          y2={PLOT_Y + PLOT_HEIGHT}
          stroke="var(--color-border)"
          strokeWidth={1}
        />

        {/* Time axis */}
        {points.map((point, i) =>
          i % stride === 0 || i === count - 1 ? (
            <text
              key={`tick-${point.key}`}
              x={bandCenter(i, count)}
              y={VB_HEIGHT - 12}
              textAnchor="middle"
              fontSize={10}
              fill="var(--color-muted-foreground)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {point.label}
            </text>
          ) : null
        )}

        {/* Hit targets: the whole band, not just the painted column */}
        {points.map((point, i) => (
          <rect
            key={`hit-${point.key}`}
            x={PLOT_X + band * i}
            y={PLOT_Y}
            width={band}
            height={PLOT_HEIGHT}
            fill="transparent"
            tabIndex={0}
            role="button"
            aria-label={`${point.rangeLabel}: ${format(point.value)} ${valueName}`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
          />
        ))}

        {/* Tooltip: enhances the axis and the table, never gates them */}
        {activePoint && box && (
          <g pointerEvents="none">
            <rect
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              rx={6}
              fill="var(--color-card)"
              stroke="var(--color-border)"
              strokeWidth={1}
            />
            <text
              x={box.textX}
              y={box.y + 15}
              fontSize={11}
              fontWeight={600}
              fill="var(--color-foreground)"
            >
              {tooltipLines[1]}
            </text>
            <text
              x={box.textX}
              y={box.y + 30}
              fontSize={11}
              fill="var(--color-muted-foreground)"
            >
              {tooltipLines[0]}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
