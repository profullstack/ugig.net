import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, DELETE } from "./route";

// ── Mocks ──────────────────────────────────────────────────────────

const mockFrom = vi.fn();
const mockAuth = vi.fn();

const supabaseClient = {
  from: mockFrom,
  auth: {
    admin: {
      getUserById: vi.fn().mockResolvedValue({ data: null }),
    },
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseClient)),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
  endorsementReceivedEmail: vi.fn().mockReturnValue({
    subject: "test",
    html: "<p>test</p>",
    text: "test",
  }),
}));

import { getAuthContext } from "@/lib/auth/get-user";
import type { AuthContext } from "@/lib/auth/get-user";
const mockGetAuthContext = vi.mocked(getAuthContext);

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(
  method: string,
  body?: Record<string, unknown>,
  searchParams?: Record<string, string>
) {
  let url = "http://localhost/api/users/testuser/endorse";
  if (searchParams) {
    const params = new URLSearchParams(searchParams);
    url += `?${params.toString()}`;
  }
  const init: {
    method: string;
    headers?: Record<string, string>;
    body?: string;
  } = { method };
  if (body) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new NextRequest(url, init);
}

const routeParams = { params: Promise.resolve({ username: "testuser" }) };

function chainResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of [
    "select",
    "insert",
    "delete",
    "update",
    "eq",
    "single",
    "order",
  ]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single.mockResolvedValue(result);
  return chain;
}

const userId = "user-123";
const endorsedUserId = "user-456";

const authContext = {
  user: {
    id: userId,
    email: "test@example.com",
    authMethod: "session" as const,
  },
  supabase: supabaseClient,
} as unknown as AuthContext;

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════
//  POST /api/users/:username/endorse
// ════════════════════════════════════════════════════════════════════

describe("POST /api/users/:username/endorse", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await POST(
      makeRequest("POST", { skill: "React" }),
      routeParams
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when skill is missing", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);
    const res = await POST(makeRequest("POST", {}), routeParams);
    expect(res.status).toBe(400);
  });

  it("returns 404 when user not found", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const profileChain = chainResult({ data: null, error: null });
    mockFrom.mockReturnValue(profileChain);

    const res = await POST(
      makeRequest("POST", { skill: "React" }),
      routeParams
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when trying to endorse yourself", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const profileChain = chainResult({
      data: { id: userId, username: "testuser", skills: ["React"] },
      error: null,
    });
    mockFrom.mockReturnValue(profileChain);

    const res = await POST(
      makeRequest("POST", { skill: "React" }),
      routeParams
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("You cannot endorse yourself");
  });

  it("returns 400 when skill is not on profile", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const profileChain = chainResult({
      data: {
        id: endorsedUserId,
        username: "testuser",
        skills: ["Python", "TypeScript"],
      },
      error: null,
    });
    mockFrom.mockReturnValue(profileChain);

    const res = await POST(
      makeRequest("POST", { skill: "Rust" }),
      routeParams
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("not listed on this user's profile");
  });

  it("creates endorsement successfully", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const endorsement = {
      id: "end-1",
      endorser_id: userId,
      endorsed_id: endorsedUserId,
      skill: "React",
      comment: null,
      created_at: new Date().toISOString(),
      endorser: {
        id: userId,
        username: "endorser",
        full_name: "Endorser",
        avatar_url: null,
      },
    };

    // Call 1: lookup endorsed profile
    const profileChain = chainResult({
      data: {
        id: endorsedUserId,
        username: "testuser",
        full_name: "Test User",
        skills: ["React", "Node.js"],
      },
      error: null,
    });

    // Call 2: insert endorsement
    const insertChain = chainResult({
      data: endorsement,
      error: null,
    });

    // Call 3: lookup endorser profile for notification
    const endorserProfileChain = chainResult({
      data: { full_name: "Endorser", username: "endorser" },
      error: null,
    });

    // Call 4: insert notification
    const notifChain = chainResult({ data: null, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      switch (callCount) {
        case 1:
          return profileChain;
        case 2:
          return insertChain;
        case 3:
          return endorserProfileChain;
        case 4:
          return notifChain;
        default:
          return chainResult({ data: null, error: null });
      }
    });

    const res = await POST(
      makeRequest("POST", { skill: "React", comment: "Great at it!" }),
      routeParams
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.skill).toBe("React");
  });

  it("returns 409 when duplicate endorsement", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const profileChain = chainResult({
      data: {
        id: endorsedUserId,
        username: "testuser",
        skills: ["React"],
      },
      error: null,
    });

    const insertChain = chainResult({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? profileChain : insertChain;
    });

    const res = await POST(
      makeRequest("POST", { skill: "React" }),
      routeParams
    );
    expect(res.status).toBe(409);
  });
});

// ════════════════════════════════════════════════════════════════════
//  DELETE /api/users/:username/endorse?skill=X
// ════════════════════════════════════════════════════════════════════

describe("DELETE /api/users/:username/endorse", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await DELETE(
      makeRequest("DELETE", undefined, { skill: "React" }),
      routeParams
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when skill param is missing", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);
    const res = await DELETE(makeRequest("DELETE"), routeParams);
    expect(res.status).toBe(400);
  });

  it("returns 404 when user not found", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const profileChain = chainResult({ data: null, error: null });
    mockFrom.mockReturnValue(profileChain);

    const res = await DELETE(
      makeRequest("DELETE", undefined, { skill: "React" }),
      routeParams
    );
    expect(res.status).toBe(404);
  });

  it("deletes endorsement successfully", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const profileChain = chainResult({
      data: { id: endorsedUserId },
      error: null,
    });

    // The route calls .delete().eq(endorser).eq(endorsed).eq(skill)
    // Last .eq() must resolve to { error: null }
    const deleteChain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["delete", "eq"]) {
      deleteChain[m] = vi.fn().mockReturnValue(deleteChain);
    }
    // After 3 .eq() calls the chain is awaited, so the last .eq() returns a resolved promise
    let eqCallCount = 0;
    deleteChain.eq.mockImplementation(() => {
      eqCallCount++;
      if (eqCallCount >= 3) {
        return Promise.resolve({ error: null });
      }
      return deleteChain;
    });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? profileChain : deleteChain;
    });

    const res = await DELETE(
      makeRequest("DELETE", undefined, { skill: "React" }),
      routeParams
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe("Endorsement removed");
  });
});
