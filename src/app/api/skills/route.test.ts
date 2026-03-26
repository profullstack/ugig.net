import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockOrder = vi.fn();
const mockRange = vi.fn();

const mockFrom = vi.fn();

const supabaseClient = {
  from: mockFrom,
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
};

const serviceClient = { from: vi.fn() };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseClient)),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => serviceClient),
}));

vi.mock("@/lib/skills/url-import", () => ({
  importSkillFromUrl: vi.fn(),
}));

vi.mock("@/lib/skills/security-scan", () => ({
  isScanAcceptable: vi.fn((r: any) => r.status === "clean"),
}));

import { GET, POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";
import { importSkillFromUrl } from "@/lib/skills/url-import";

const mockImportSkillFromUrl = vi.mocked(importSkillFromUrl);

const mockGetAuthContext = vi.mocked(getAuthContext);

// ── Helpers ────────────────────────────────────────────────────────

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/skills");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url, { method: "GET" });
}

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/skills", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Chain builder for Supabase query mocking
function chainMock(finalResult: { data?: unknown; count?: number; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const handler = () =>
    new Proxy(chain, {
      get(_, prop) {
        if (prop === "then") {
          // Make it thenable to resolve the final result
          return (resolve: (v: unknown) => void) => resolve(finalResult);
        }
        return handler;
      },
    });
  return handler;
}

// ── Tests ──────────────────────────────────────────────────────────

describe("GET /api/skills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns listings with default sort", async () => {
    const listings = [
      { id: "1", title: "Skill A", slug: "skill-a", status: "active" },
    ];

    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          or: () => ({
            overlaps: () => ({
              order: () => ({
                range: () =>
                  Promise.resolve({ data: listings, count: 1, error: null }),
              }),
            }),
            order: () => ({
              range: () =>
                Promise.resolve({ data: listings, count: 1, error: null }),
            }),
          }),
          order: () => ({
            range: () =>
              Promise.resolve({ data: listings, count: 1, error: null }),
          }),
        }),
      }),
    });

    const response = await GET(makeGetRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.listings).toHaveLength(1);
    expect(json.total).toBe(1);
    expect(json.page).toBe(1);
  });
});

describe("POST /api/skills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const response = await POST(
      makePostRequest({
        title: "Test Skill",
        description: "A test skill for automation",
        price_sats: 1000,
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid input", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: supabaseClient as any,
    });

    const response = await POST(
      makePostRequest({
        title: "ab", // too short
        description: "short",
        price_sats: -1,
      })
    );

    expect(response.status).toBe(400);
  });

  it("creates listing for authenticated user", async () => {
    const createdListing = {
      id: "listing-1",
      slug: "test-skill",
      title: "Test Skill",
      seller_id: "user-1",
    };

    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: supabaseClient as any,
    });

    // Mock slug collision check
    serviceClient.from.mockImplementation((table: string) => {
      if (table === "skill_listings") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: createdListing, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    const response = await POST(
      makePostRequest({
        title: "Test Skill",
        description: "A test skill for doing automated things well",
        price_sats: 1000,
        category: "automation",
        tags: ["test"],
        skill_file_url: "https://example.com/SKILL.md",
      })
    );

    const json = await response.json();
    expect(response.status).toBe(201);
    expect(json.listing.slug).toBe("test-skill");
  });

  it("auto-triggers scan when skill_file_url is provided", async () => {
    const createdListing = {
      id: "listing-1",
      slug: "test-skill",
      title: "Test Skill",
      seller_id: "user-1",
      status: "draft",
    };

    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: supabaseClient as any,
    });

    serviceClient.from.mockImplementation((table: string) => {
      if (table === "skill_listings") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: { ...createdListing }, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    mockImportSkillFromUrl.mockResolvedValue({
      success: true,
      storagePath: "user-1/test-skill/SKILL.md",
      contentHash: "abc123",
      fileSizeBytes: 100,
      fileName: "SKILL.md",
      scanResult: { status: "clean", fileHash: "abc", fileSizeBytes: 100, findings: [], scannerVersion: "v1" },
      scanSource: "url_import",
      sourceUrl: "https://example.com/SKILL.md",
      findingsCountBySeverity: {},
    });

    const response = await POST(
      makePostRequest({
        title: "Test Skill",
        description: "A test skill for doing automated things well",
        price_sats: 1000,
        skill_file_url: "https://example.com/SKILL.md",
      })
    );

    expect(response.status).toBe(201);
    // Import was triggered automatically
    expect(mockImportSkillFromUrl).toHaveBeenCalledOnce();
    const json = await response.json();
    expect(json.import).toBeTruthy();
    expect(json.import.scan_status).toBe("clean");
  });

  it("blocks publish when scan finds suspicious content", async () => {
    const createdListing = {
      id: "listing-1",
      slug: "test-skill",
      title: "Test Skill",
      seller_id: "user-1",
      status: "active", // Starts as active now
    };

    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: supabaseClient as any,
    });

    serviceClient.from.mockImplementation((table: string) => {
      if (table === "skill_listings") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: { ...createdListing }, error: null }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      }
      return {};
    });

    mockImportSkillFromUrl.mockResolvedValue({
      success: true,
      storagePath: "user-1/test-skill/SKILL.md",
      contentHash: "abc123",
      fileSizeBytes: 100,
      fileName: "SKILL.md",
      scanResult: { status: "suspicious", fileHash: "abc", fileSizeBytes: 100, findings: [{ rule: "no-eval", severity: "high", detail: "eval detected" }], scannerVersion: "v1" },
      scanSource: "url_import",
      sourceUrl: "https://example.com/SKILL.md",
      findingsCountBySeverity: { high: 1 },
    });

    const response = await POST(
      makePostRequest({
        title: "Test Skill",
        description: "A test skill for doing automated things well",
        price_sats: 1000,
        skill_file_url: "https://example.com/SKILL.md",
        status: "active",
      })
    );

    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.error).toContain("Security scan");
    expect(json.listing.status).toBe("draft"); // Downgraded to draft
  });

  it("allows publish when scan is clean on create", async () => {
    const createdListing = {
      id: "listing-1",
      slug: "test-skill",
      title: "Test Skill",
      seller_id: "user-1",
      status: "active", // Starts as active now (default)
    };

    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: supabaseClient as any,
    });

    serviceClient.from.mockImplementation((table: string) => {
      if (table === "skill_listings") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: { ...createdListing }, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    mockImportSkillFromUrl.mockResolvedValue({
      success: true,
      storagePath: "user-1/test-skill/SKILL.md",
      contentHash: "abc123",
      fileSizeBytes: 100,
      fileName: "SKILL.md",
      scanResult: { status: "clean", fileHash: "abc", fileSizeBytes: 100, findings: [], scannerVersion: "v1" },
      scanSource: "url_import",
      sourceUrl: "https://example.com/SKILL.md",
      findingsCountBySeverity: {},
    });

    const response = await POST(
      makePostRequest({
        title: "Test Skill",
        description: "A test skill for doing automated things well",
        price_sats: 1000,
        skill_file_url: "https://example.com/SKILL.md",
        status: "active",
      })
    );

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.listing.status).toBe("active"); // Stays active — scan was clean
  });
});
