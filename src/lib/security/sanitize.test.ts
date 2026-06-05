import { describe, it, expect } from "vitest";
import { escapePostgrestSearchValue, sanitizeUrlParam, sanitizeSearchParams } from "./sanitize";

describe("sanitizeUrlParam", () => {
  it("should return empty string for null/undefined input", () => {
    expect(sanitizeUrlParam(null)).toBe("");
    expect(sanitizeUrlParam("")).toBe("");
  });

  it("should return safe strings unchanged", () => {
    expect(sanitizeUrlParam("react")).toBe("react");
    expect(sanitizeUrlParam("remote,fullstack")).toBe("remote,fullstack");
  });

  it("should remove XSS characters", () => {
    expect(sanitizeUrlParam("<script>alert('xss')</script>")).toBe("scriptalert(xss)/script");
    expect(sanitizeUrlParam('"><img src=x onerror=alert(1)>')).toBe("img src=x alert(1)");
    expect(sanitizeUrlParam("javascript:alert(1)")).toBe("alert(1)");
    expect(sanitizeUrlParam("data:text/html,<script>")).toBe("text/html,script");
  });

  it("should remove event handlers", () => {
    expect(sanitizeUrlParam("test onload=alert(1)")).toBe("test alert(1)");
    expect(sanitizeUrlParam("onerror=fetch(evil)")).toBe("fetch(evil)");
  });

  it("should remove null bytes", () => {
    expect(sanitizeUrlParam("test\x00script")).toBe("testscript");
  });

  it("should handle multiple attack vectors", () => {
    const malicious = '<script>document.cookie</script><img src="x" onerror="steal()">';
    const sanitized = sanitizeUrlParam(malicious);
    expect(sanitized).not.toContain("<");
    expect(sanitized).not.toContain(">");
    expect(sanitized).not.toContain('"');
    expect(sanitized).not.toContain("'");
    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).not.toContain("onerror");
  });
});

describe("sanitizeSearchParams", () => {
  it("should sanitize a URL search parameter", () => {
    const url = new URL("https://example.com/api?tag=<script>alert(1)</script>");
    expect(sanitizeSearchParams(url, "tag")).toBe("scriptalert(1)/script");
  });

  it("should return empty string for missing parameter", () => {
    const url = new URL("https://example.com/api");
    expect(sanitizeSearchParams(url, "missing")).toBe("");
  });
});

describe("escapePostgrestSearchValue", () => {
  it("escapes LIKE wildcards and PostgREST filter punctuation", () => {
    expect(escapePostgrestSearchValue("100%_match*,(v1.2)")).toBe(
      "100\\%\\_match\\*\\,\\(v1\\.2\\)"
    );
  });
});
