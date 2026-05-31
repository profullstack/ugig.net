import { describe, expect, it } from "vitest";
import { parsePageParam } from "./pagination";

describe("parsePageParam", () => {
  it("defaults missing values to page 1", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam(null)).toBe(1);
    expect(parsePageParam("")).toBe(1);
  });

  it("clamps invalid low values to page 1", () => {
    expect(parsePageParam("-1")).toBe(1);
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("abc")).toBe(1);
    expect(parsePageParam("Infinity")).toBe(1);
    expect(parsePageParam("-Infinity")).toBe(1);
  });

  it("truncates fractional page values", () => {
    expect(parsePageParam("2.9")).toBe(2);
  });

  it("caps very large page values", () => {
    expect(parsePageParam("999999999")).toBe(1_000);
  });
});
