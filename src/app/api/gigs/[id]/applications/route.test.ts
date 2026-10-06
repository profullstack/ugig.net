import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

// ── Mocks ──────────────────────────────────────────────────────────

const mockFrom = vi.fn();

const supabaseClient = {
  from: mockFrom,
  // users_are_blocked — nobody is blocked in these fixtures.
  rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
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

const { mockCheckApplicationLimits } = vi.hoisted(() => ({
  mockCheckApplicationLimits: vi.fn(),
}));
vi.mock("@/lib/limits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/limits")>()),
  checkApplicationLimits: mockCheckApplicationLimits,
}));

import { getAuthContext } from "@/lib/auth/get-user";
import { sendEmail } from "@/lib/email";
import { dispatchWebhookAsync } from "@/lib/webhooks/dispatch";
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
  mockCheckApplicationLimits.mockResolvedValue({ ok: true, held: false });
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

describe("POST /api/gigs/[id]/applications - success paths", () => {
  it("returns 201 when application is created successfully", async () => {
    const callLog: string[] = [];

    const mockChain = () => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "update", "insert", "eq", "single", "contains", "order"]) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      return chain;
    };

    // Track which table is queried and return appropriate data
    mockFrom.mockImplementation((table: string) => {
      callLog.push(table);
      const chain = mockChain();

      if (table === "gigs") {
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: { poster_id: "poster-1", status: "active", title: "Test Gig", poster: { full_name: "Poster" } },
          error: null,
        });
      } else if (table === "applications" && callLog.filter(t => t === "applications").length === 1) {
        // First call: check existing — none found
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
      } else if (table === "applications") {
        // Second call: insert
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: { id: "app-1", gig_id: "00000000-0000-4000-a000-000000000001", applicant_id: "user-1" },
          error: null,
        });
      } else if (table === "notifications") {
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
        // insert returns the chain directly
        (chain.insert as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null });
      } else if (table === "profiles") {
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: { full_name: "Applicant", username: "applicant" },
          error: null,
        });
      }
      return chain;
    });

    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "api_key" },
      supabase: supabaseClient,
    } as MockAuthContext);

    const req = makeRequest({ cover_letter: "x".repeat(60) });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.application).toBeDefined();
    expect(body.application.id).toBe("app-1");
  });

  it("returns 400 when already applied", async () => {
    const mockChain = () => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "update", "insert", "eq", "single", "contains", "order"]) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      return chain;
    };

    const callCount: Record<string, number> = {};
    mockFrom.mockImplementation((table: string) => {
      callCount[table] = (callCount[table] || 0) + 1;
      const chain = mockChain();

      if (table === "gigs") {
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: { poster_id: "poster-1", status: "active", title: "Test Gig", poster: { full_name: "Poster" } },
          error: null,
        });
      } else if (table === "applications") {
        // Existing application found
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: { id: "existing-app" },
          error: null,
        });
      }
      return chain;
    });

    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "api_key" },
      supabase: supabaseClient,
    } as MockAuthContext);

    const req = makeRequest({ cover_letter: "x".repeat(60) });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("already applied");
  });
});

// ── Application caps + spam hold (PRD 02) ───────────────────────────

describe("POST /api/gigs/[id]/applications - limits", () => {
  const LETTER = "I have shipped this kind of work before and can start this week. ".repeat(2);

  function setup(inserts: Record<string, unknown>[]) {
    mockFrom.mockImplementation((table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "update", "insert", "eq", "single", "contains", "order"]) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      if (table === "gigs") {
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: { poster_id: "poster-1", status: "active", title: "Test Gig", poster: null },
          error: null,
        });
      } else if (table === "applications") {
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
        (chain.insert as ReturnType<typeof vi.fn>).mockImplementation((payload: Record<string, unknown>) => {
          inserts.push(payload);
          (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: "app-new" }, error: null });
          return chain;
        });
      } else {
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
      }
      return chain;
    });
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "api_key" },
      supabase: supabaseClient,
    } as MockAuthContext);
  }

  it("returns 429 with Retry-After at the daily cap", async () => {
    const inserts: Record<string, unknown>[] = [];
    setup(inserts);
    mockCheckApplicationLimits.mockResolvedValue({
      ok: false,
      status: 429,
      error: "New agent accounts can send at most 20 applications in 24 hours.",
      retryAfterSeconds: 3600,
    });
    const res = await POST(makeRequest({ cover_letter: LETTER }), routeParams);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
    expect(inserts).toHaveLength(0);
    expect(mockCheckApplicationLimits).toHaveBeenCalledWith(supabaseClient, "user-1", LETTER);
  });

  it("returns 409 for a duplicate cover letter", async () => {
    const inserts: Record<string, unknown>[] = [];
    setup(inserts);
    mockCheckApplicationLimits.mockResolvedValue({ ok: false, status: 409, error: "Tailor it." });
    const res = await POST(makeRequest({ cover_letter: LETTER }), routeParams);
    expect(res.status).toBe(409);
    expect(inserts).toHaveLength(0);
  });

  it("holds a spam-flagged applicant's application without notifying the poster", async () => {
    const inserts: Record<string, unknown>[] = [];
    setup(inserts);
    mockCheckApplicationLimits.mockResolvedValue({ ok: true, held: true });
    const res = await POST(makeRequest({ cover_letter: LETTER }), routeParams);
    expect(res.status).toBe(201);
    expect(inserts[0].metadata).toEqual({ held: "spam_review" });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(dispatchWebhookAsync).not.toHaveBeenCalled();
  });
});

describe("GET /api/gigs/[id]/applications - held applications", () => {
  it("leaves applications held for spam review out of the poster's list", async () => {
    const isCalls: unknown[][] = [];
    mockFrom.mockImplementation((table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "single", "order", "is"]) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      (chain.is as ReturnType<typeof vi.fn>).mockImplementation((...args: unknown[]) => {
        isCalls.push(args);
        return chain;
      });
      if (table === "gigs") {
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: { poster_id: "poster-1", title: "Test Gig" },
          error: null,
        });
      } else {
        (chain.order as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], error: null });
      }
      return chain;
    });
    mockGetAuthContext.mockResolvedValue({
      user: { id: "poster-1", authMethod: "api_key" },
      supabase: supabaseClient,
    } as MockAuthContext);

    const res = await GET(
      new NextRequest("http://localhost/api/gigs/00000000-0000-4000-a000-000000000001/applications"),
      routeParams
    );
    expect(res.status).toBe(200);
    expect(isCalls).toContainEqual(["metadata->>held", null]);
  });
});
