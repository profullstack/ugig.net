import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

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

// Mock checkAutoVerification — used by the route
vi.mock("@/lib/verification/check", () => ({
  checkAutoVerification: vi.fn(),
}));

import { getAuthContext } from "@/lib/auth/get-user";
import type { AuthContext } from "@/lib/auth/get-user";
import { checkAutoVerification } from "@/lib/verification/check";
const mockGetAuthContext = vi.mocked(getAuthContext);
const mockCheckAutoVerification = vi.mocked(checkAutoVerification);

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest() {
  return new NextRequest("http://localhost/api/verification/status", {
    method: "GET",
  });
}

function chainResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "single"]) {
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
//  GET /api/verification/status
// ════════════════════════════════════════════════════════════════════

describe("GET /api/verification/status", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 404 when profile not found", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const profileChain = chainResult({ data: null, error: null });
    mockFrom.mockReturnValue(profileChain);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Profile not found");
  });

  it("returns verification status for authenticated user", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const profile = {
      verified: true,
      verified_at: "2024-03-15T00:00:00Z",
      verification_type: "auto",
    };
    const latestRequest = {
      id: "req-1",
      user_id: userId,
      evidence: "https://github.com/test",
      status: "approved",
      created_at: "2024-03-14T00:00:00Z",
    };
    const autoCheck = {
      eligible: false,
      criteria: {
        completedGigs: { met: true, value: 5, required: 3 },
        averageRating: { met: true, value: 4.8, required: 4.0 },
        accountAge: { met: true, value: 90, required: 7 },
      },
      alreadyVerified: true,
    };

    // 1st from("profiles") - profile data
    const profileChain = chainResult({ data: profile, error: null });
    // 2nd from("verification_requests") - latest request
    const requestChain = chainResult({ data: latestRequest, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? profileChain : requestChain;
    });

    mockCheckAutoVerification.mockResolvedValue(autoCheck);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.verified).toBe(true);
    expect(json.verified_at).toBe("2024-03-15T00:00:00Z");
    expect(json.verification_type).toBe("auto");
    expect(json.latest_request).toEqual(latestRequest);
    expect(json.auto_check).toEqual(autoCheck);
  });

  it("returns auto-check criteria results for unverified user", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const profile = {
      verified: false,
      verified_at: null,
      verification_type: null,
    };
    const autoCheck = {
      eligible: false,
      criteria: {
        completedGigs: { met: false, value: 1, required: 3 },
        averageRating: { met: false, value: null, required: 4.0 },
        accountAge: { met: true, value: 30, required: 7 },
      },
      alreadyVerified: false,
    };

    const profileChain = chainResult({ data: profile, error: null });
    // No latest request
    const requestChain = chainResult({ data: null, error: { code: "PGRST116" } });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? profileChain : requestChain;
    });

    mockCheckAutoVerification.mockResolvedValue(autoCheck);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.verified).toBe(false);
    expect(json.latest_request).toBeNull();
    expect(json.auto_check.eligible).toBe(false);
    expect(json.auto_check.criteria.completedGigs.met).toBe(false);
    expect(json.auto_check.criteria.accountAge.met).toBe(true);
  });

  it("passes supabase client to checkAutoVerification", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const profileChain = chainResult({
      data: { verified: false, verified_at: null, verification_type: null },
      error: null,
    });
    const requestChain = chainResult({ data: null, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? profileChain : requestChain;
    });

    mockCheckAutoVerification.mockResolvedValue({
      eligible: false,
      criteria: {
        completedGigs: { met: false, value: 0, required: 3 },
        averageRating: { met: false, value: null, required: 4.0 },
        accountAge: { met: false, value: 0, required: 7 },
      },
      alreadyVerified: false,
    });

    await GET(makeRequest());

    expect(mockCheckAutoVerification).toHaveBeenCalledWith(supabaseClient, userId);
  });
});
