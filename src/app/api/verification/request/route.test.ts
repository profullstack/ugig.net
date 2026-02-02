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
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60000 })),
  rateLimitExceeded: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => "user-123"),
}));

import { getAuthContext } from "@/lib/auth/get-user";
import type { AuthContext } from "@/lib/auth/get-user";
const mockGetAuthContext = vi.mocked(getAuthContext);

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(body?: Record<string, unknown>) {
  const url = "http://localhost/api/verification/request";
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function chainResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "insert", "eq", "single"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  return chain;
}

// ── Setup ──────────────────────────────────────────────────────────

const userId = "user-123";
const authContext = {
  user: { id: userId, email: "test@example.com", authMethod: "session" as const },
  supabase: supabaseClient,
} as unknown as AuthContext;

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════
//  POST /api/verification/request
// ════════════════════════════════════════════════════════════════════

describe("POST /api/verification/request", () => {
  // ── Auth ───────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await POST(makeRequest({ evidence: "https://github.com/myprofile" }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  // ── Validation ─────────────────────────────────────────────────

  it("returns 400 when evidence is missing", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const res = await POST(makeRequest({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("Evidence is required");
  });

  it("returns 400 when evidence is too short", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const res = await POST(makeRequest({ evidence: "short" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("Evidence is required");
  });

  it("returns 400 when evidence is not a string", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const res = await POST(makeRequest({ evidence: 12345 }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("Evidence is required");
  });

  // ── Already verified ──────────────────────────────────────────

  it("returns 400 when user is already verified", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    // profiles check returns verified = true
    const profileChain = chainResult({ data: { verified: true }, error: null });
    mockFrom.mockReturnValue(profileChain);

    const res = await POST(makeRequest({ evidence: "https://github.com/myprofile" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("You are already verified");
  });

  // ── Duplicate pending request ─────────────────────────────────

  it("returns 400 when there is already a pending request", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    // 1st from("profiles") - not verified
    const profileChain = chainResult({ data: { verified: false }, error: null });
    // 2nd from("verification_requests") - existing pending request
    const existingReqChain = chainResult({
      data: { id: "req-1", status: "pending" },
      error: null,
    });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? profileChain : existingReqChain;
    });

    const res = await POST(makeRequest({ evidence: "https://github.com/myprofile" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("You already have a pending verification request");
  });

  // ── Successful creation ───────────────────────────────────────

  it("creates verification request and returns 201", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const newRequest = {
      id: "req-new",
      user_id: userId,
      evidence: "https://github.com/myprofile",
      status: "pending",
    };

    // 1st from("profiles") - not verified
    const profileChain = chainResult({ data: { verified: false }, error: null });
    // 2nd from("verification_requests") - no existing request
    const existingReqChain = chainResult({ data: null, error: { code: "PGRST116", message: "not found" } });
    // 3rd from("verification_requests") - insert
    const insertChain: Record<string, unknown> = {};
    for (const m of ["insert", "select", "single"]) {
      insertChain[m] = vi.fn().mockReturnValue(insertChain);
    }
    (insertChain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: newRequest,
      error: null,
    });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return profileChain;
      if (callCount === 2) return existingReqChain;
      return insertChain;
    });

    const res = await POST(makeRequest({ evidence: "https://github.com/myprofile" }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.request).toEqual(newRequest);
  });

  // ── DB error on insert ────────────────────────────────────────

  it("returns 400 when insert fails", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    // 1st: profiles - not verified
    const profileChain = chainResult({ data: { verified: false }, error: null });
    // 2nd: verification_requests - no existing
    const existingReqChain = chainResult({ data: null, error: null });
    // 3rd: insert fails
    const insertChain: Record<string, unknown> = {};
    for (const m of ["insert", "select", "single"]) {
      insertChain[m] = vi.fn().mockReturnValue(insertChain);
    }
    (insertChain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: "Insert failed" },
    });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return profileChain;
      if (callCount === 2) return existingReqChain;
      return insertChain;
    });

    const res = await POST(makeRequest({ evidence: "https://github.com/myprofile-long-enough" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Insert failed");
  });

  it("trims evidence whitespace", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const newRequest = {
      id: "req-trimmed",
      user_id: userId,
      evidence: "https://github.com/myprofile",
      status: "pending",
    };

    const profileChain = chainResult({ data: { verified: false }, error: null });
    const existingReqChain = chainResult({ data: null, error: null });
    const insertChain: Record<string, unknown> = {};
    for (const m of ["insert", "select", "single"]) {
      insertChain[m] = vi.fn().mockReturnValue(insertChain);
    }
    (insertChain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: newRequest,
      error: null,
    });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return profileChain;
      if (callCount === 2) return existingReqChain;
      return insertChain;
    });

    const res = await POST(
      makeRequest({ evidence: "  https://github.com/myprofile  " })
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    // Check that insert was called with trimmed evidence
    expect((insertChain.insert as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({
        evidence: "https://github.com/myprofile",
      })
    );
  });
});
