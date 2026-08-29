import { describe, expect, it } from "vitest";
import {
  axisMax,
  axisTicks,
  formatPct,
  formatUnits,
  formatUsd,
  labelStride,
  niceMax,
} from "./chart-scale";

describe("niceMax", () => {
  it("rounds up to a clean axis top", () => {
    expect(niceMax(87)).toBe(100);
    expect(niceMax(120)).toBe(200);
    expect(niceMax(210)).toBe(250);
    expect(niceMax(1)).toBe(1);
    expect(niceMax(0.4)).toBe(0.5);
  });

  it("never returns zero or NaN for degenerate input", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(-5)).toBe(1);
    expect(niceMax(NaN)).toBe(1);
    expect(niceMax(Infinity)).toBe(1);
  });
});

describe("axisTicks", () => {
  it("spans zero to the clean maximum inclusive", () => {
    expect(axisTicks(87, 4)).toEqual([0, 25, 50, 75, 100]);
  });

  it("tolerates a nonsense tick count", () => {
    expect(axisTicks(100, 0)).toEqual([0, 100]);
  });

  it("keeps ticks whole for counted things", () => {
    // 4 steps would give 12.5 / 37.5; 5 steps divides 50 cleanly.
    expect(axisTicks(43, 4, true)).toEqual([0, 10, 20, 30, 40, 50]);
    expect(axisTicks(2.2, 4, true)).toEqual([0, 1, 2, 3]);
    expect(axisTicks(43, 4, false)).toEqual([0, 12.5, 25, 37.5, 50]);
  });
});

describe("axisMax", () => {
  it("reports the top the ticks actually reach", () => {
    expect(axisMax(axisTicks(43, 4, true))).toBe(50);
    expect(axisMax([])).toBe(1);
  });
});

describe("labelStride", () => {
  it("labels every tick when the series is short", () => {
    expect(labelStride(6, 8)).toBe(1);
    expect(labelStride(8, 8)).toBe(1);
  });

  it("thins the labels on a long series", () => {
    expect(labelStride(30, 8)).toBe(4);
    expect(labelStride(90, 8)).toBe(12);
  });
});

describe("formatUsd", () => {
  it("compacts large values and keeps cents on small ones", () => {
    expect(formatUsd(2_400_000)).toBe("$2.4M");
    expect(formatUsd(24_000)).toBe("$24K");
    expect(formatUsd(1_200)).toBe("$1.2K");
    expect(formatUsd(120)).toBe("$120");
    expect(formatUsd(12)).toBe("$12");
    expect(formatUsd(2.5)).toBe("$2.50");
    expect(formatUsd(0)).toBe("$0");
  });
});

describe("formatUnits", () => {
  it("keeps whole units whole", () => {
    expect(formatUnits(4)).toBe("4");
    expect(formatUnits(4.5)).toBe("4.5");
    expect(formatUnits(12_000)).toBe("12K");
  });
});

describe("formatPct", () => {
  it("signs the change and drops noise decimals", () => {
    expect(formatPct(0.5)).toBe("+50%");
    expect(formatPct(-0.5)).toBe("-50%");
    expect(formatPct(0.034)).toBe("+3.4%");
    expect(formatPct(0)).toBe("0%");
  });
});
