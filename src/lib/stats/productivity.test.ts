import { describe, expect, it } from "vitest";
import {
  bucketSizeFor,
  bucketStart,
  breakdownByLabel,
  buildSeries,
  filterRange,
  isPerspective,
  isRangeKey,
  normalizeLabel,
  pctChange,
  resolveRange,
  summarize,
  type WorkEvent,
} from "./productivity";

function event(at: string, costUsd: number, units: number, label = "PRs merged"): WorkEvent {
  return { at, costUsd, units, label, source: "invoice" };
}

describe("isRangeKey / isPerspective", () => {
  it("accepts the supported values only", () => {
    expect(isRangeKey("30d")).toBe(true);
    expect(isRangeKey("ytd")).toBe(true);
    expect(isRangeKey("42d")).toBe(false);
    expect(isRangeKey(undefined)).toBe(false);
    expect(isPerspective("spent")).toBe(true);
    expect(isPerspective("earned")).toBe(true);
    expect(isPerspective("both")).toBe(false);
  });
});

describe("bucketSizeFor", () => {
  it("keeps every range to a readable number of marks", () => {
    expect(bucketSizeFor("7d")).toBe("day");
    expect(bucketSizeFor("30d")).toBe("day");
    expect(bucketSizeFor("90d")).toBe("week");
    expect(bucketSizeFor("6m")).toBe("week");
    expect(bucketSizeFor("12m")).toBe("month");
    expect(bucketSizeFor("ytd")).toBe("month");
    expect(bucketSizeFor("all")).toBe("month");
  });
});

describe("resolveRange", () => {
  const now = new Date("2026-08-29T18:00:00Z");

  it("ends at the start of tomorrow so today is included", () => {
    const { end } = resolveRange("7d", now);
    expect(end.toISOString()).toBe("2026-08-30T00:00:00.000Z");
  });

  it("spans exactly N days for the day ranges", () => {
    const { start, end } = resolveRange("7d", now);
    expect(start?.toISOString()).toBe("2026-08-23T00:00:00.000Z");
    expect((end.getTime() - start!.getTime()) / 86_400_000).toBe(7);
  });

  it("starts YTD on January 1", () => {
    expect(resolveRange("ytd", now).start?.toISOString()).toBe(
      "2026-01-01T00:00:00.000Z"
    );
  });

  it("walks back whole months for 6m and 12m", () => {
    expect(resolveRange("12m", now).start?.toISOString()).toBe(
      "2025-08-29T00:00:00.000Z"
    );
    // Aug 29 less six months is Feb 29, which 2026 does not have, so the day
    // rolls forward into March rather than clamping to the end of February.
    expect(resolveRange("6m", now).start?.toISOString()).toBe(
      "2026-03-01T00:00:00.000Z"
    );
  });

  it("gives the previous window the same span as the current one", () => {
    const { start, previousStart } = resolveRange("30d", now);
    expect(
      (start!.getTime() - previousStart!.getTime()) / 86_400_000
    ).toBe(30);
  });

  it("has no start or comparison window for all time", () => {
    const all = resolveRange("all", now);
    expect(all.start).toBeNull();
    expect(all.previousStart).toBeNull();
  });
});

describe("bucketStart", () => {
  it("truncates to the UTC day", () => {
    expect(bucketStart(new Date("2026-08-29T23:59:59Z"), "day")).toBe("2026-08-29");
  });

  it("backs a week up to Monday", () => {
    // 2026-08-29 is a Saturday.
    expect(bucketStart(new Date("2026-08-29T12:00:00Z"), "week")).toBe("2026-08-24");
    expect(bucketStart(new Date("2026-08-24T00:00:00Z"), "week")).toBe("2026-08-24");
    // Sunday belongs to the week that started the previous Monday.
    expect(bucketStart(new Date("2026-08-23T12:00:00Z"), "week")).toBe("2026-08-17");
  });

  it("truncates to the first of the month", () => {
    expect(bucketStart(new Date("2026-08-29T12:00:00Z"), "month")).toBe("2026-08-01");
  });
});

describe("filterRange", () => {
  const end = new Date("2026-08-30T00:00:00Z");

  it("includes the start instant and excludes the end instant", () => {
    const start = new Date("2026-08-23T00:00:00Z");
    const events = [
      event("2026-08-22T23:59:59Z", 10, 1),
      event("2026-08-23T00:00:00Z", 10, 1),
      event("2026-08-29T23:59:59Z", 10, 1),
      event("2026-08-30T00:00:00Z", 10, 1),
    ];
    expect(filterRange(events, start, end)).toHaveLength(2);
  });

  it("keeps everything before the end when there is no start", () => {
    expect(filterRange([event("2020-01-01T00:00:00Z", 5, 1)], null, end)).toHaveLength(1);
  });

  it("drops events with an unparseable timestamp", () => {
    expect(filterRange([event("not-a-date", 5, 1)], null, end)).toHaveLength(0);
  });
});

describe("buildSeries", () => {
  const start = new Date("2026-08-24T00:00:00Z");
  const end = new Date("2026-08-27T00:00:00Z");

  it("zero-fills empty buckets so a gap reads as a gap", () => {
    const series = buildSeries([event("2026-08-24T10:00:00Z", 100, 4)], start, end, "day");
    expect(series.map((p) => p.key)).toEqual(["2026-08-24", "2026-08-25", "2026-08-26"]);
    expect(series[1]).toMatchObject({ costUsd: 0, units: 0, costPerUnit: null });
  });

  it("sums cost and units inside a bucket and derives cost per unit", () => {
    const series = buildSeries(
      [event("2026-08-24T01:00:00Z", 60, 2), event("2026-08-24T20:00:00Z", 40, 3)],
      start,
      end,
      "day"
    );
    expect(series[0]).toMatchObject({ costUsd: 100, units: 5, costPerUnit: 20 });
  });

  it("labels buckets for the axis and the tooltip", () => {
    const series = buildSeries([], start, end, "day");
    expect(series[0].label).toBe("Aug 24");
    expect(series[0].rangeLabel).toBe("Aug 24, 2026");
  });

  it("labels a week bucket as its Monday-to-Sunday span", () => {
    const series = buildSeries(
      [],
      new Date("2026-08-24T00:00:00Z"),
      new Date("2026-08-31T00:00:00Z"),
      "week"
    );
    expect(series).toHaveLength(1);
    expect(series[0].rangeLabel).toBe("Aug 24 – Aug 30, 2026");
  });

  it("rolls month buckets over a year boundary", () => {
    const series = buildSeries(
      [],
      new Date("2025-11-15T00:00:00Z"),
      new Date("2026-02-01T00:00:00Z"),
      "month"
    );
    expect(series.map((p) => p.key)).toEqual([
      "2025-11-01",
      "2025-12-01",
      "2026-01-01",
    ]);
  });

  it("starts an all-time series at the first event", () => {
    const series = buildSeries(
      [event("2026-06-10T00:00:00Z", 10, 1)],
      null,
      new Date("2026-08-30T00:00:00Z"),
      "month"
    );
    expect(series.map((p) => p.key)).toEqual([
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
    ]);
  });

  it("returns nothing for an all-time series with no events", () => {
    expect(buildSeries([], null, end, "month")).toEqual([]);
  });
});

describe("summarize", () => {
  it("totals cost, units and item count", () => {
    const totals = summarize([
      event("2026-08-01T00:00:00Z", 60, 3),
      event("2026-08-02T00:00:00Z", 40, 1),
    ]);
    expect(totals).toEqual({ costUsd: 100, units: 4, items: 2, costPerUnit: 25 });
  });

  it("leaves cost per unit null when nothing was delivered", () => {
    expect(summarize([]).costPerUnit).toBeNull();
    expect(summarize([event("2026-08-01T00:00:00Z", 50, 0)]).costPerUnit).toBeNull();
  });
});

describe("pctChange", () => {
  it("returns the signed fraction of change", () => {
    expect(pctChange(150, 100)).toBeCloseTo(0.5);
    expect(pctChange(50, 100)).toBeCloseTo(-0.5);
  });

  it("returns null when there is no usable baseline", () => {
    expect(pctChange(100, 0)).toBeNull();
    expect(pctChange(100, null)).toBeNull();
    expect(pctChange(null, 100)).toBeNull();
  });
});

describe("normalizeLabel", () => {
  it("collapses whitespace and names the empty case", () => {
    expect(normalizeLabel("  PRs   merged ")).toBe("PRs merged");
    expect(normalizeLabel("   ")).toBe("Unlabeled");
  });
});

describe("breakdownByLabel", () => {
  it("groups case-insensitively and ranks by cost", () => {
    const rows = breakdownByLabel([
      event("2026-08-01T00:00:00Z", 20, 2, "PRs merged"),
      event("2026-08-02T00:00:00Z", 40, 2, "prs merged "),
      event("2026-08-03T00:00:00Z", 90, 3, "Design review"),
    ]);
    expect(rows[0]).toMatchObject({ label: "Design review", costUsd: 90, costPerUnit: 30 });
    expect(rows[1]).toMatchObject({ label: "PRs merged", costUsd: 60, units: 4, items: 2 });
  });

  it("folds the tail into a single Other row instead of adding colors", () => {
    const events = Array.from({ length: 9 }, (_, i) =>
      event("2026-08-01T00:00:00Z", 100 - i, 1, `Task ${i}`)
    );
    const rows = breakdownByLabel(events, 7);
    expect(rows).toHaveLength(8);
    expect(rows[7].label).toBe("Other (2)");
    expect(rows[7].items).toBe(2);
  });
});
