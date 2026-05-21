import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getAppUrl } from "./app-url";

describe("getAppUrl", () => {
  let originalAppUrl: string | undefined;

  beforeEach(() => {
    originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  });

  it("returns NEXT_PUBLIC_APP_URL when set", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://custom.example.com";
    expect(getAppUrl()).toBe("https://custom.example.com");
  });

  it("strips trailing slash from NEXT_PUBLIC_APP_URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://custom.example.com/";
    expect(getAppUrl()).toBe("https://custom.example.com");
  });

  it("extracts origin from request URL when env is not set", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const req = new Request("http://staging.ugig.net/api/test");
    expect(getAppUrl(req)).toBe("http://staging.ugig.net");
  });

  it("extracts origin from localhost request", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const req = new Request("http://localhost:3000/api/test");
    expect(getAppUrl(req)).toBe("http://localhost:3000");
  });

  it("prefers NEXT_PUBLIC_APP_URL over request origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://production.ugig.net";
    const req = new Request("http://staging.ugig.net/api/test");
    expect(getAppUrl(req)).toBe("https://production.ugig.net");
  });

  it("falls back to https://ugig.net when no env and no request", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(getAppUrl()).toBe("https://ugig.net");
  });

  it("falls back to https://ugig.net when request URL is unparseable", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    // Passing undefined request should still work
    expect(getAppUrl(undefined)).toBe("https://ugig.net");
  });
});
