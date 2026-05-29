import { describe, expect, it } from "vitest";
import { parsePaginationParam } from "./api-pagination";

describe("parsePaginationParam", () => {
  it("uses the default for missing and non-numeric values", () => {
    expect(parsePaginationParam(null, 20, 1, 50)).toBe(20);
    expect(parsePaginationParam("abc", 20, 1, 50)).toBe(20);
  });

  it("clamps values to the allowed range", () => {
    expect(parsePaginationParam("-5", 20, 0, 100_000)).toBe(0);
    expect(parsePaginationParam("999", 20, 1, 50)).toBe(50);
  });

  it("truncates fractional values before clamping", () => {
    expect(parsePaginationParam("12.9", 20, 1, 50)).toBe(12);
  });
});
