import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

// ── Mocks ──────────────────────────────────────────────────────────

const mockFrom = vi.fn();

const supabaseClient = {
  from: mockFrom,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseClient)),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
  createServiceClient: vi.fn(() => ({
    auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: null }) } },
  })),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  rateLimitExceeded: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => "test"),
}));

vi.mock("@/lib/reputation-hooks", () => ({
  getUserDid: vi.fn().mockResolvedValue(null),
  onApplicationSubmitted: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  newApplicationEmail: vi.fn(() => ({ subject: "test", text: "test", html: "test" })),
}));

vi.mock("@/lib/webhooks/dispatch", () => ({
  dispatchWebhookAsync: vi.fn(),
}));

vi.mock("@/lib/activity", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

import { getAuthContext } from "@/lib/auth/get-user";
const mockGetAuthContext = vi.mocked(getAuthContext);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockAuthContext = any;

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/gigs/00000000-0000-4000-a000-000000000001/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const routeParams = { params: Promise.resolve({ id: "00000000-0000-4000-a000-000000000001" }) };

function chainResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "update", "insert", "eq", "single", "contains", "order"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────

describe("POST /api/gigs/[id]/applications", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const req = makeRequest({ cover_letter: "x".repeat(50) });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(401);
  });

  it("returns 400 when cover_letter is too short", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "api_key" },
      supabase: supabaseClient,
    } as MockAuthContext);

    const req = makeRequest({ cover_letter: "too short" });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(400);
  });

  it("returns 404 when gig not found", async () => {
    const gigChain = chainResult({ data: null, error: null });
    mockFrom.mockReturnValue(gigChain);

    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "api_key" },
      supabase: supabaseClient,
    } as MockAuthContext);

    const req = makeRequest({ cover_letter: "x".repeat(60) });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(404);
  });

  it("returns 400 when applying to own gig", async () => {
    const gigChain = chainResult({
      data: { poster_id: "user-1", status: "active", title: "Test", poster: { full_name: "Test" } },
      error: null,
    });
    mockFrom.mockReturnValue(gigChain);

    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "api_key" },
      supabase: supabaseClient,
    } as MockAuthContext);

    const req = makeRequest({ cover_letter: "x".repeat(60) });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("cannot apply to your own gig");
  });
});
