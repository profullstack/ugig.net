import { describe, expect, it } from "vitest";
import { hasActiveDirectoryFilters } from "./filter-state";

describe("hasActiveDirectoryFilters", () => {
  it("detects filters that can narrow directory results", () => {
    expect(hasActiveDirectoryFilters({ q: "nomatch" })).toBe(true);
    expect(hasActiveDirectoryFilters({ available: "true" })).toBe(true);
    expect(hasActiveDirectoryFilters({}, ["TypeScript"])).toBe(true);
  });

  it("ignores empty and inactive values", () => {
    expect(hasActiveDirectoryFilters({})).toBe(false);
    expect(hasActiveDirectoryFilters({ q: " ", available: "false" }, [""])).toBe(
      false
    );
  });
});
