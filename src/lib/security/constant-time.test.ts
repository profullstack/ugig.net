import { describe, expect, it } from "vitest";
import { timingSafeStringEqual } from "./constant-time";

describe("timingSafeStringEqual", () => {
  it("compares equal and unequal ASCII strings", () => {
    expect(timingSafeStringEqual("secret", "secret")).toBe(true);
    expect(timingSafeStringEqual("secret", "public")).toBe(false);
  });

  it("rejects strings with equal character length but unequal byte length", () => {
    expect(timingSafeStringEqual("é", "a")).toBe(false);
  });
});
