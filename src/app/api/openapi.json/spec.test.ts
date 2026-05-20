import { describe, it, expect } from "vitest";
import spec from "../../../../public/openapi.json";

// ════════════════════════════════════════════════════════════════════
//  public/openapi.json — Spec validation tests
// ════════════════════════════════════════════════════════════════════

const VALID_HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head", "trace"];

type JsonResponse = {
  content?: {
    "application/json"?: {
      schema: unknown;
    };
  };
};

type PostOperation = {
  operationId: string;
  responses: Record<string, JsonResponse>;
};

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
      "/api/affiliates/apply",
      "/api/affiliates/offers/{id}/apply",
      "/api/affiliates/click",
      "/api/affiliates/offers/{id}/conversions",
      "/api/affiliates/offers/{id}/conversions/pay",
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
      "AffiliateApplication",
      "AffiliateApplyInput",
      "AffiliateApplyResponse",
      "AffiliateConversion",
      "AffiliateConversionInput",
      "AffiliateConversionUpdateInput",
      "AffiliateConversionActionInput",
      "AffiliateConversionMutationResponse",
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

  it("documents the affiliate offer apply endpoints (#91)", () => {
    const { paths } = spec;
    const wrapper = paths["/api/affiliates/apply"] as { post: PostOperation };
    const scoped = paths["/api/affiliates/offers/{id}/apply"] as { post: PostOperation };

    expect(wrapper.post.operationId).toBe("applyToAffiliateOfferByBody");
    expect(scoped.post.operationId).toBe("applyToAffiliateOffer");
    expect(scoped.post.responses["201"].content?.["application/json"]?.schema).toEqual({
      "$ref": "#/components/schemas/AffiliateApplyResponse",
    });
  });

  it("documents affiliate tracking and conversion endpoints (#89)", () => {
    const { paths } = spec;
    const click = paths["/api/affiliates/click"] as { get: PostOperation };
    const conversions = paths["/api/affiliates/offers/{id}/conversions"] as {
      get: PostOperation;
      post: PostOperation;
      put: PostOperation;
      delete: PostOperation;
    };
    const pay = paths["/api/affiliates/offers/{id}/conversions/pay"] as { post: PostOperation };

    expect(click.get.operationId).toBe("recordAffiliateClick");
    expect(conversions.get.operationId).toBe("listAffiliateConversions");
    expect(conversions.post.operationId).toBe("recordAffiliateConversion");
    expect(conversions.put.operationId).toBe("updateAffiliateConversion");
    expect(conversions.delete.operationId).toBe("deleteAffiliateConversion");
    expect(pay.post.operationId).toBe("payAffiliateConversion");
    expect(conversions.post.responses["200"].content?.["application/json"]?.schema).toEqual({
      "$ref": "#/components/schemas/AffiliateConversionMutationResponse",
    });
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
