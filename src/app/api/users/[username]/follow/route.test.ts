import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST, DELETE } from "./route";

// ── Mocks ──────────────────────────────────────────────────────────

const mockFrom = vi.fn();

const supabaseClient = {
  from: mockFrom,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseClient)),
}));

const mockAdminGetUserById = vi.fn();
const mockServiceFrom = vi.fn();
const mockServiceClient = {
  from: mockServiceFrom,
  auth: {
    admin: {
      getUserById: mockAdminGetUserById,
    },
  },
};

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
  createServiceClient: vi.fn(() => mockServiceClient),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(() => Promise.resolve({ success: true })),
  newFollowerEmail: vi.fn(() => ({
    subject: "test",
    html: "<p>test</p>",
    text: "test",
  })),
}));

vi.mock("@/lib/reputation-hooks", () => ({
  getUserDid: vi.fn().mockResolvedValue("did:test:123"),
  onFollowed: vi.fn(),
}));

const mockLogActivity = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/activity", () => ({
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
}));

import { getAuthContext } from "@/lib/auth/get-user";
import type { AuthContext } from "@/lib/auth/get-user";
const mockGetAuthContext = vi.mocked(getAuthContext);

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(method: string) {
  const url = "http://localhost/api/users/testuser/follow";
  return new NextRequest(url, { method });
}

const routeParams = { params: Promise.resolve({ username: "testuser" }) };

function chainResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of [
    "select",
    "insert",
    "delete",
    "eq",
    "single",
    "maybeSingle",
  ]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  (chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  return chain;
}

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockAdminGetUserById.mockResolvedValue({
    data: { user: { email: "target@example.com" } },
  });
});

// ════════════════════════════════════════════════════════════════════
//  POST /api/users/[username]/follow
// ════════════════════════════════════════════════════════════════════

describe("POST /api/users/[username]/follow", () => {
  const userId = "user-123";
  const authContext = {
    user: { id: userId, email: "test@example.com", authMethod: "session" as const },
    supabase: supabaseClient,
  } as unknown as AuthContext;

  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await POST(makeRequest("POST"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 404 when target user not found", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const profileChain = chainResult({ data: null, error: { message: "not found" } });
    mockFrom.mockReturnValue(profileChain);

    const res = await POST(makeRequest("POST"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("User not found");
  });

  it("returns 400 when trying to follow yourself", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const profileChain = chainResult({
      data: { id: userId, username: "testuser", full_name: "Test" },
      error: null,
    });
    mockFrom.mockReturnValue(profileChain);

    const res = await POST(makeRequest("POST"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("You cannot follow yourself");
  });

  it("returns 201 when successfully following", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const targetId = "target-456";

    // 1. Profile lookup chain (target user): .from("profiles").select().eq().single()
    const profileChain = chainResult({
      data: { id: targetId, username: "testuser", full_name: "Test User", did: "did:test:target123" },
      error: null,
    });

    // 2. Insert follow: .from("follows").insert({...}) — returns { error }
    const insertChain: Record<string, unknown> = {};
    insertChain.insert = vi.fn().mockResolvedValue({ error: null });

    // 3. Follower profile: .from("profiles").select().eq().single()
    const followerChain = chainResult({
      data: { username: "me", full_name: "Me" },
      error: null,
    });

    // 4. Notification insert: .from("notifications").insert({...})
    const notifChain: Record<string, unknown> = {};
    notifChain.insert = vi.fn().mockResolvedValue({ error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return profileChain; // target profile lookup
      if (callCount === 2) return insertChain; // insert follow
      return followerChain; // follower profile
    });

    // Service client handles notifications
    mockServiceFrom.mockReturnValue(notifChain);

    const res = await POST(makeRequest("POST"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);

    // Verify activity logging
    expect(mockLogActivity).toHaveBeenCalledWith(
      supabaseClient,
      expect.objectContaining({
        userId: "user-123",
        activityType: "followed_user",
        referenceId: "target-456",
        referenceType: "user",
      })
    );
  });

  it("does not log activity when follow fails", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const targetId = "target-456";
    const profileChain = chainResult({
      data: { id: targetId, username: "testuser", full_name: "Test User" },
      error: null,
    });
    const insertChain: Record<string, unknown> = {};
    insertChain.insert = vi.fn().mockResolvedValue({
      error: { code: "23505", message: "duplicate key" },
    });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? profileChain : insertChain;
    });

    await POST(makeRequest("POST"), routeParams);
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("returns 409 when already following", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const targetId = "target-456";

    const profileChain = chainResult({
      data: { id: targetId, username: "testuser", full_name: "Test User" },
      error: null,
    });

    const insertChain: Record<string, unknown> = {};
    insertChain.insert = vi.fn().mockResolvedValue({
      error: { code: "23505", message: "duplicate key" },
    });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? profileChain : insertChain;
    });

    const res = await POST(makeRequest("POST"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe("Already following this user");
  });
});

// ════════════════════════════════════════════════════════════════════
//  DELETE /api/users/[username]/follow
// ════════════════════════════════════════════════════════════════════

describe("DELETE /api/users/[username]/follow", () => {
  const userId = "user-123";
  const authContext = {
    user: { id: userId, email: "test@example.com", authMethod: "session" as const },
    supabase: supabaseClient,
  } as unknown as AuthContext;

  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await DELETE(makeRequest("DELETE"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 200 when successfully unfollowed", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const profileChain = chainResult({
      data: { id: "target-456" },
      error: null,
    });

    // Chain: .from("follows").delete().eq().eq() — awaited at the end
    // Use a thenable object so await picks it up
    const deleteChain = {
      delete: vi.fn(),
      eq: vi.fn(),
      then: vi.fn((resolve: (v: { error: null }) => void) => resolve({ error: null })),
    };
    deleteChain.delete.mockReturnValue(deleteChain);
    deleteChain.eq.mockReturnValue(deleteChain);

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? profileChain : deleteChain;
    });

    const res = await DELETE(makeRequest("DELETE"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════
//  GET /api/users/[username]/follow — check follow status
// ════════════════════════════════════════════════════════════════════

describe("GET /api/users/[username]/follow", () => {
  it("returns following: false when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await GET(makeRequest("GET"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.following).toBe(false);
  });

  it("returns following: true when user follows target", async () => {
    const userId = "user-123";
    const authContext = {
      user: { id: userId, authMethod: "session" as const },
      supabase: supabaseClient,
    } as unknown as AuthContext;
    mockGetAuthContext.mockResolvedValue(authContext);

    // Profile lookup
    const profileChain = chainResult({
      data: { id: "target-456" },
      error: null,
    });

    // Follow check
    const followChain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "maybeSingle"]) {
      followChain[m] = vi.fn().mockReturnValue(followChain);
    }
    (followChain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: "follow-id" },
      error: null,
    });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? profileChain : followChain;
    });

    const res = await GET(makeRequest("GET"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.following).toBe(true);
  });

  it("returns following: false when user does not follow target", async () => {
    const userId = "user-123";
    const authContext = {
      user: { id: userId, authMethod: "session" as const },
      supabase: supabaseClient,
    } as unknown as AuthContext;
    mockGetAuthContext.mockResolvedValue(authContext);

    const profileChain = chainResult({
      data: { id: "target-456" },
      error: null,
    });

    const followChain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "maybeSingle"]) {
      followChain[m] = vi.fn().mockReturnValue(followChain);
    }
    (followChain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: null,
    });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? profileChain : followChain;
    });

    const res = await GET(makeRequest("GET"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.following).toBe(false);
  });
});
