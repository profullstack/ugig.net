import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

const mockUpload = vi.fn();
const serviceClient = {
  from: vi.fn(),
  storage: {
    from: vi.fn(() => ({
      upload: mockUpload,
    })),
  },
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

vi.mock("@/lib/skills/security-scan", () => ({
  getDefaultScanner: vi.fn(() => ({
    scan: vi.fn(),
  })),
  scanWithRetry: vi.fn(),
  isScanAcceptable: vi.fn(),
}));

import { POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";
import { scanWithRetry, isScanAcceptable } from "@/lib/skills/security-scan";

const mockGetAuthContext = vi.mocked(getAuthContext);
const mockScanWithRetry = vi.mocked(scanWithRetry);
const mockIsScanAcceptable = vi.mocked(isScanAcceptable);

// ── Helpers ────────────────────────────────────────────────────────

/** Create a File-like object with arrayBuffer() that works in jsdom */
function makeFile(content: string, name: string, type: string) {
  const buf = Buffer.from(content);
  return {
    name,
    type,
    size: buf.length,
    arrayBuffer: () => Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
  };
}

function makeUploadRequest(fields: Record<string, string | ReturnType<typeof makeFile>> = {}) {
  const store = new Map(Object.entries(fields));
  const fakeFormData = {
    get: (key: string) => store.get(key) ?? null,
  };
  const req = new NextRequest("http://localhost/api/skills/upload", {
    method: "POST",
  });
  req.formData = () => Promise.resolve(fakeFormData as unknown as FormData);
  return req;
}

function mockServiceChain(listing: any, scanInsert: any = { data: { id: "scan-1" }, error: null }) {
  serviceClient.from.mockImplementation((table: string) => {
    if (table === "skill_listings") {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: listing, error: listing ? null : { message: "not found" } }),
          }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      };
    }
    if (table === "skill_security_scans") {
      return {
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve(scanInsert),
          }),
        }),
      };
    }
    return {};
  });
}

// ── Tests ──────────────────────────────────────────────────────────

describe("POST /api/skills/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const response = await POST(makeUploadRequest());
    expect(response.status).toBe(401);
  });

  it("returns 400 when no file provided", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: {} as any,
    });

    const response = await POST(
      makeUploadRequest({ listing_id: "listing-1" })
    );
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("No file");
  });

  it("returns 400 when no listing_id provided", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: {} as any,
    });

    const file = makeFile("test content", "test.txt", "text/plain");
    const response = await POST(makeUploadRequest({ file }));
    expect(response.status).toBe(400);
  });

  it("returns 403 when user doesn't own the listing", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: {} as any,
    });

    mockServiceChain({ id: "listing-1", seller_id: "other-user", slug: "test" });

    const file = makeFile("test content", "test.txt", "text/plain");
    const response = await POST(
      makeUploadRequest({ file, listing_id: "listing-1" })
    );
    expect(response.status).toBe(403);
  });

  it("returns 422 when scan detects malicious content", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: {} as any,
    });

    mockServiceChain({ id: "listing-1", seller_id: "user-1", slug: "test-skill" });

    mockScanWithRetry.mockResolvedValue({
      status: "malicious",
      fileHash: "abc123",
      fileSizeBytes: 100,
      findings: [{ rule: "blocked-extension", severity: "critical", detail: ".exe blocked" }],
      scannerVersion: "test",
    });
    mockIsScanAcceptable.mockReturnValue(false);

    const file = makeFile("MZ", "malicious.exe", "application/octet-stream");
    const response = await POST(
      makeUploadRequest({ file, listing_id: "listing-1" })
    );

    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.error).toContain("security scan");
    expect(json.scan.status).toBe("malicious");
  });

  it("returns 200 when scan is clean", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: {} as any,
    });

    mockServiceChain({ id: "listing-1", seller_id: "user-1", slug: "test-skill" });

    mockScanWithRetry.mockResolvedValue({
      status: "clean",
      fileHash: "abc123",
      fileSizeBytes: 100,
      findings: [],
      scannerVersion: "test",
    });
    mockIsScanAcceptable.mockReturnValue(true);
    mockUpload.mockResolvedValue({ error: null });

    const file = makeFile("safe content", "safe.txt", "text/plain");
    const response = await POST(
      makeUploadRequest({ file, listing_id: "listing-1" })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.scan.status).toBe("clean");
  });
});
