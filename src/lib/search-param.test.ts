import { describe, it, expect } from "vitest";
import { getSearchTerm } from "./search-param";

const p = (qs: string) => new URLSearchParams(qs);

describe("getSearchTerm", () => {
  it("reads search, q and query alike", () => {
    expect(getSearchTerm(p("search=rust"))).toBe("rust");
    expect(getSearchTerm(p("q=rust"))).toBe("rust");
    expect(getSearchTerm(p("query=rust"))).toBe("rust");
  });

  it("prefers search, then q, then query", () => {
    expect(getSearchTerm(p("query=c&q=b&search=a"))).toBe("a");
    expect(getSearchTerm(p("query=c&q=b"))).toBe("b");
  });

  it("skips empty and whitespace-only values", () => {
    expect(getSearchTerm(p("search=&q=%20&query=go"))).toBe("go");
    expect(getSearchTerm(p(""))).toBe("");
  });

  it("trims and caps the length", () => {
    expect(getSearchTerm(p("q=%20%20hi%20"))).toBe("hi");
    expect(getSearchTerm(p(`q=${"x".repeat(500)}`))).toHaveLength(200);
    expect(getSearchTerm(p("q=abcdef"), 3)).toBe("abc");
  });
});
