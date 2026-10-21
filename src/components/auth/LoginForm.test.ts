import { describe, it, expect } from "vitest";
import { safeRedirectPath } from "./LoginForm";

describe("safeRedirectPath", () => {
  it("keeps same-site paths with a query", () => {
    expect(safeRedirectPath("/checkout?plan=annual")).toBe("/checkout?plan=annual");
  });
  it("drops off-site and protocol-relative targets", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "", null, undefined]) {
      expect(safeRedirectPath(bad as any)).toBeNull();
    }
  });
});
