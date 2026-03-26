import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

const mockInsert = vi.fn();
const mockUpdate = vi.fn();

const serviceClient = {
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({})),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => serviceClient),
}));

vi.mock("@/lib/mcp/security-scan", () => ({
  combinedScan: vi.fn(),
  MCP_SCANNER_VERSION: "mcp-scanner-0.1.0",
}));

import { POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";
import { combinedScan } from "@/lib/mcp/security-scan";

const mockGetAuthContext = vi.mocked(getAuthContext);
const mockCombinedScan = vi.mocked(combinedScan);

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest() {
  return new NextRequest("http://localhost/api/mcp/test-mcp/scan", {
    method: "POST",
  });
}

const makeParams = (slug = "test-mcp") => Promise.resolve({ slug });

function mockListing(listing: any) {
  serviceClient.from.mockImplementation((table: string) => {
    if (table === "mcp_listings") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: listing,
                error: listing ? null : { message: "not found" },
              }),
          }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      };
    }
    if (table === "mcp_security_scans") {
      return {
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: { id: "scan-1" },
                error: null,
              }),
          }),
        }),
      };
    }
    return {};
  });
}

// ── Tests ──────────────────────────────────────────────────────────

describe("POST /api/mcp/[slug]/scan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await POST(makeRequest(), { params: makeParams() });
    expect(res.status).toBe(401);
  });

  it("returns 404 when listing not found", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: {} as any,
    });
    mockListing(null);

    const res = await POST(makeRequest(), { params: makeParams() });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not the owner", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "other-user", authMethod: "session" },
      supabase: {} as any,
    });
    mockListing({
      id: "listing-1",
      seller_id: "seller-1",
      slug: "test-mcp",
      mcp_server_url: "https://mcp.example.com",
      source_url: null,
    });

    const res = await POST(makeRequest(), { params: makeParams() });
    expect(res.status).toBe(403);
  });

  it("returns 422 when no scannable content exists", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
      supabase: {} as any,
    });
    mockListing({
      id: "listing-1",
      seller_id: "seller-1",
      slug: "test-mcp",
      mcp_server_url: null,
      source_url: null,
    });

    const res = await POST(makeRequest(), { params: makeParams() });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toContain("No scannable content");
  });

  it("scans MCP server and returns clean result", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
      supabase: {} as any,
    });
    mockListing({
      id: "listing-1",
      seller_id: "seller-1",
      slug: "test-mcp",
      mcp_server_url: "https://mcp.example.com",
      source_url: "https://github.com/example/mcp-server",
    });

    mockCombinedScan.mockResolvedValue({
      status: "clean",
      rating: "A",
      securityScore: 85,
      findings: [],
      spidershieldReport: { available: true },
      mcpScanReport: { available: true },
      scannerVersion: "mcp-scanner-0.1.0",
    });

    const res = await POST(makeRequest(), { params: makeParams() });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.scan.status).toBe("clean");
    expect(json.scan.rating).toBe("A");
    expect(json.scan.security_score).toBe(85);
    expect(json.scan.findings_count).toBe(0);
    expect(json.scan.findings).toEqual([]);
    expect(json.scan.scanner_version).toBe("mcp-scanner-0.1.0");
    expect(json.scan.scan_id).toBe("scan-1");

    // Verify scanner was called with correct args
    expect(mockCombinedScan).toHaveBeenCalledWith(
      "https://mcp.example.com",
      "https://github.com/example/mcp-server"
    );
  });

  it("scans and returns warning result with findings", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
      supabase: {} as any,
    });
    mockListing({
      id: "listing-1",
      seller_id: "seller-1",
      slug: "test-mcp",
      mcp_server_url: "https://mcp.example.com",
      source_url: null,
    });

    mockCombinedScan.mockResolvedValue({
      status: "warning",
      rating: "C",
      securityScore: 55,
      findings: [
        { source: "spidershield", rule: "no-auth", severity: "high", detail: "No authentication configured" },
        { source: "mcp-scan", rule: "exposed-env", severity: "medium", detail: "Environment variables exposed" },
      ],
      spidershieldReport: { available: true },
      mcpScanReport: { available: true },
      scannerVersion: "mcp-scanner-0.1.0",
    });

    const res = await POST(makeRequest(), { params: makeParams() });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.scan.status).toBe("warning");
    expect(json.scan.rating).toBe("C");
    expect(json.scan.findings_count).toBe(2);
    // Should not expose internal rule names
    expect(json.scan.findings[0]).toEqual({
      source: "spidershield",
      severity: "high",
      detail: "No authentication configured",
    });
    expect(json.scan.findings[0].rule).toBeUndefined();
  });

  it("falls back to source_url when no server URL", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "seller-1", authMethod: "session" },
      supabase: {} as any,
    });
    mockListing({
      id: "listing-1",
      seller_id: "seller-1",
      slug: "test-mcp",
      mcp_server_url: null,
      source_url: "https://github.com/example/mcp-server",
    });

    mockCombinedScan.mockResolvedValue({
      status: "clean",
      rating: "B",
      securityScore: 70,
      findings: [],
      spidershieldReport: { available: true },
      mcpScanReport: { available: false },
      scannerVersion: "mcp-scanner-0.1.0",
    });

    const res = await POST(makeRequest(), { params: makeParams() });
    expect(res.status).toBe(200);

    // combinedScan should be called with source_url as first arg
    expect(mockCombinedScan).toHaveBeenCalledWith(
      "https://github.com/example/mcp-server",
      undefined
    );
  });
});
