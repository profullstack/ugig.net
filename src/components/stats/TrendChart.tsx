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
  textWidth,
  tooltipBox,
  yFor,
} from "./geometry";

export interface TrendPoint {
  key: string;
  label: string;
  rangeLabel: string;
  /** null where no work was delivered — the line breaks rather than inventing one. */
  value: number | null;
}

interface TrendChartProps {
  points: TrendPoint[];
  colorVar: string;
  format: ValueFormat;
  valueName: string;
  title: string;
  /** Optional horizontal reference, e.g. the average for the whole period. */
  reference?: { value: number; label: string } | null;
}

export function TrendChart({
  points,
  colorVar,
  format: formatName,
  valueName,
  title,
  reference = null,
}: TrendChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const format = (value: number) => formatValue(value, formatName);

  const count = points.length;
  const values = points
    .map((p) => p.value)
    .filter((v): v is number => v !== null);
  const rawMax = Math.max(
    values.length > 0 ? Math.max(...values) : 0,
    reference?.value ?? 0
  );
  const ticks = axisTicks(rawMax, 4, formatName === "units");
  const max = axisMax(ticks);
  const stride = labelStride(count);
  const band = bandWidth(count);

  // Break the path wherever a bucket has no work, so an empty week is visibly
  // empty instead of being bridged by a straight line.
  const segments: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  points.forEach((point, i) => {
    if (point.value === null) {
      if (current.length > 0) segments.push(current);
      current = [];
      return;
    }
    current.push({ x: bandCenter(i, count), y: yFor(point.value, max) });
  });
  if (current.length > 0) segments.push(current);

  const lastIndex = points.reduce(
    (found, p, i) => (p.value !== null ? i : found),
    -1
  );
  const showEveryDot = count <= 20;

  const activePoint =
    active !== null && points[active]?.value !== null ? points[active] : null;
  const tooltipLines = activePoint
    ? [activePoint.rangeLabel, `${format(activePoint.value as number)} ${valueName}`]
    : [];
  const box = activePoint
    ? tooltipBox(
        bandCenter(active as number, count),
        yFor(activePoint.value as number, max),
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

        {/* Period reference. Dashed because it IS a threshold, not a grid. */}
        {reference && reference.value > 0 && (
          <g>
            <line
              x1={PLOT_X}
              y1={yFor(reference.value, max)}
              x2={PLOT_X + PLOT_WIDTH}
              y2={yFor(reference.value, max)}
              stroke="var(--color-muted-foreground)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          </g>
        )}

        {/* Crosshair: readers aim at a date, not at a 2px line */}
        {active !== null && (
          <line
            x1={bandCenter(active, count)}
            y1={PLOT_Y}
            x2={bandCenter(active, count)}
            y2={PLOT_Y + PLOT_HEIGHT}
            stroke="var(--color-border)"
            strokeWidth={1}
          />
        )}

        {segments.map((segment, i) => (
          <polyline
            key={`seg-${i}`}
            points={segment.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={`var(${colorVar})`}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Dots on a short series, and always the end marker */}
        {points.map((point, i) => {
          if (point.value === null) return null;
          const isEnd = i === lastIndex;
          const isActive = active === i;
          if (!showEveryDot && !isEnd && !isActive) return null;
          return (
            <circle
              key={`dot-${point.key}`}
              cx={bandCenter(i, count)}
              cy={yFor(point.value, max)}
              r={isEnd || isActive ? 4.5 : 3.5}
              fill={`var(${colorVar})`}
              stroke="var(--color-card)"
              strokeWidth={2}
            />
          );
        })}

        {/* The reference label paints after the data, on a chip in the surface
            color, so a dot crossing the line can never obscure it. */}
        {reference && reference.value > 0 && (
          <g pointerEvents="none">
            <rect
              x={PLOT_X + 3}
              y={yFor(reference.value, max) - 14}
              width={textWidth(reference.label, 10) + 6}
              height={13}
              rx={3}
              fill="var(--color-card)"
            />
            <text
              x={PLOT_X + 6}
              y={yFor(reference.value, max) - 4}
              textAnchor="start"
              fontSize={10}
              fill="var(--color-muted-foreground)"
            >
              {reference.label}
            </text>
          </g>
        )}

        {/* The end value is direct-labelled; the rest live on the axis and table */}
        {lastIndex >= 0 &&
          (() => {
            const text = format(points[lastIndex].value as number);
            const cx = Math.min(
              bandCenter(lastIndex, count),
              PLOT_X + PLOT_WIDTH - 18
            );
            const cy = Math.max(
              PLOT_Y - 4,
              yFor(points[lastIndex].value as number, max) - 10
            );
            const w = textWidth(text, 10) + 6;
            return (
              <g pointerEvents="none">
                <rect
                  x={cx - w / 2}
                  y={cy - 9}
                  width={w}
                  height={12}
                  rx={3}
                  fill="var(--color-card)"
                />
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill="var(--color-foreground)"
                >
                  {text}
                </text>
              </g>
            );
          })()}

        <line
          x1={PLOT_X}
          y1={PLOT_Y + PLOT_HEIGHT}
          x2={PLOT_X + PLOT_WIDTH}
          y2={PLOT_Y + PLOT_HEIGHT}
          stroke="var(--color-border)"
          strokeWidth={1}
        />

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

        {/* Nearest-x hit bands, so the pointer never has to find the line */}
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
            aria-label={`${point.rangeLabel}: ${
              point.value === null ? "no work delivered" : `${format(point.value)} ${valueName}`
            }`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
          />
        ))}

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
