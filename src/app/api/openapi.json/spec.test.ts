import { describe, it, expect } from "vitest";
import spec from "../../../../public/openapi.json";

// ════════════════════════════════════════════════════════════════════
//  public/openapi.json — Spec validation tests
// ════════════════════════════════════════════════════════════════════

const VALID_HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head", "trace"];

describe("OpenAPI spec (public/openapi.json)", () => {
  it("is valid JSON and parses as an object", () => {
    expect(spec).toBeDefined();
    expect(typeof spec).toBe("object");
    expect(spec).not.toBeNull();
  });

  it("has paths for key endpoints", () => {
    const { paths } = spec;
    expect(paths).toBeDefined();

    const requiredPaths = [
      "/api/gigs",
      "/api/feed",
      "/api/posts",
      "/api/auth/signup",
      "/api/auth/login",
      "/api/auth/logout",
      "/api/profile",
      "/api/conversations",
      "/api/notifications",
      "/api/reviews",
      "/api/applications",
    ];

    for (const p of requiredPaths) {
      expect(paths).toHaveProperty(p, expect.anything());
    }
  });

  it("has a components/schemas section", () => {
    expect(spec.components).toBeDefined();
    expect(spec.components.schemas).toBeDefined();
    expect(typeof spec.components.schemas).toBe("object");
    expect(Object.keys(spec.components.schemas).length).toBeGreaterThan(0);
  });

  it("has known schemas defined", () => {
    const expectedSchemas = [
      "Error",
      "Gig",
      "GigInput",
      "Post",
      "PostInput",
      "Profile",
      "Application",
      "Review",
      "Notification",
      "Comment",
    ];

    for (const s of expectedSchemas) {
      expect(spec.components.schemas).toHaveProperty(s);
    }
  });

  it("has at least one HTTP method defined for every path", () => {
    const { paths } = spec;
    const pathKeys = Object.keys(paths);
    expect(pathKeys.length).toBeGreaterThan(0);

    for (const pathKey of pathKeys) {
      const pathObj = paths[pathKey as keyof typeof paths] as Record<string, unknown>;
      const methods = Object.keys(pathObj).filter((k) =>
        VALID_HTTP_METHODS.includes(k),
      );
      expect(
        methods.length,
        `Path "${pathKey}" has no HTTP methods defined`,
      ).toBeGreaterThan(0);
    }
  });

  it("has security schemes defined", () => {
    expect(spec.components.securitySchemes).toBeDefined();
    expect(typeof spec.components.securitySchemes).toBe("object");

    const schemes = spec.components.securitySchemes;
    // Should have bearer auth and API key
    expect(schemes).toHaveProperty("bearerAuth");
    expect(schemes).toHaveProperty("apiKey");

    // Verify bearer scheme structure
    expect(schemes.bearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
    });

    // Verify API key scheme structure
    expect(schemes.apiKey).toMatchObject({
      type: "apiKey",
      in: "header",
      name: "X-API-Key",
    });
  });

  it("has valid OpenAPI version", () => {
    expect(spec.openapi).toBeDefined();
    expect(spec.openapi).toMatch(/^3\.\d+\.\d+$/);
  });

  it("has server definitions", () => {
    expect(spec.servers).toBeDefined();
    expect(Array.isArray(spec.servers)).toBe(true);
    expect(spec.servers.length).toBeGreaterThan(0);
    for (const server of spec.servers) {
      expect(server.url).toBeDefined();
      expect(typeof server.url).toBe("string");
    }
  });
});
