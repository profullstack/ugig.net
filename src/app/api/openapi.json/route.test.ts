import { describe, it, expect } from "vitest";
import { GET } from "./route";

// ════════════════════════════════════════════════════════════════════
//  GET /api/openapi.json — Route handler tests
// ════════════════════════════════════════════════════════════════════

describe("GET /api/openapi.json", () => {
  it("returns valid JSON", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body).toBeDefined();
    expect(typeof body).toBe("object");
  });

  it("has Content-Type application/json", async () => {
    const res = await GET();
    const contentType = res.headers.get("content-type");
    expect(contentType).toContain("application/json");
  });

  it("contains openapi version field", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.openapi).toBeDefined();
    expect(typeof body.openapi).toBe("string");
    expect(body.openapi).toMatch(/^3\.\d+\.\d+$/);
  });

  it("contains paths object with API endpoints", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.paths).toBeDefined();
    expect(typeof body.paths).toBe("object");
    expect(Object.keys(body.paths).length).toBeGreaterThan(0);
    // Verify at least some known endpoints exist
    expect(body.paths).toHaveProperty("/api/gigs");
    expect(body.paths).toHaveProperty("/api/feed");
  });

  it("contains info object with title and version", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.info).toBeDefined();
    expect(typeof body.info.title).toBe("string");
    expect(body.info.title.length).toBeGreaterThan(0);
    expect(typeof body.info.version).toBe("string");
    expect(body.info.version.length).toBeGreaterThan(0);
  });

  it("sets CORS and cache headers", async () => {
    const res = await GET();
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
  });
});
