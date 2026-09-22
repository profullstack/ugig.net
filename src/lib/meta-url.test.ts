import { describe, expect, it } from "vitest";
import { toHttpUrl } from "./meta-url";

describe("toHttpUrl", () => {
  it("rejects the data: favicon that suppresses the icon request", () => {
    // <link rel="icon" href="data:,"> — example.com ships this, and it used to
    // reach the directory as logo_url and render as a broken image.
    expect(toHttpUrl("data:,", "https://example.com")).toBe("");
    expect(
      toHttpUrl("data:image/png;base64,iVBORw0KGgo=", "https://example.com")
    ).toBe("");
  });

  it("rejects other non-http schemes", () => {
    expect(toHttpUrl("about:blank", "https://example.com")).toBe("");
    expect(toHttpUrl("javascript:void(0)", "https://example.com")).toBe("");
  });

  it("returns nothing for empty or whitespace hrefs", () => {
    expect(toHttpUrl("", "https://example.com")).toBe("");
    expect(toHttpUrl("   ", "https://example.com")).toBe("");
    expect(toHttpUrl(null, "https://example.com")).toBe("");
    expect(toHttpUrl(undefined, "https://example.com")).toBe("");
  });

  it("resolves relative hrefs against the page URL", () => {
    expect(toHttpUrl("/favicon.ico", "https://example.com/a/b")).toBe(
      "https://example.com/favicon.ico"
    );
    expect(toHttpUrl("icon.png", "https://example.com/a/b")).toBe(
      "https://example.com/a/icon.png"
    );
  });

  it("keeps absolute http(s) URLs, including protocol-relative ones", () => {
    expect(toHttpUrl("https://cdn.example.com/logo.svg", "https://example.com")).toBe(
      "https://cdn.example.com/logo.svg"
    );
    expect(toHttpUrl("//cdn.example.com/logo.svg", "https://example.com")).toBe(
      "https://cdn.example.com/logo.svg"
    );
  });

  it("returns nothing when the href cannot be parsed", () => {
    expect(toHttpUrl("http://[", "https://example.com")).toBe("");
  });
});
