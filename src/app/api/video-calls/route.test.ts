import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

// ── Mocks ──────────────────────────────────────────────────────────

const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockOr = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();

const supabaseClient = {
  from: mockFrom,
};

const mockGetUserById = vi.fn();
const adminClient = {
  auth: {
    admin: {
      getUserById: mockGetUserById,
    },
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseClient)),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
  createServiceClient: vi.fn(() => adminClient),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
  videoCallInviteEmail: vi.fn().mockReturnValue({
    subject: "Test subject",
    html: "<p>test</p>",
    text: "test",
  }),
}));

vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "abc123def456"),
}));

import { getAuthContext } from "@/lib/auth/get-user";
import { sendEmail, videoCallInviteEmail } from "@/lib/email";
import type { AuthContext } from "@/lib/auth/get-user";
const mockGetAuthContext = vi.mocked(getAuthContext);
const mockSendEmail = vi.mocked(sendEmail);
const mockVideoCallInviteEmail = vi.mocked(videoCallInviteEmail);

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/video-calls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/video-calls");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

function chainResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "single",
    "order",
    "or",
    "limit",
    "is",
    "not",
    "gte",
    "in",
  ]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  (chain.order as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  return chain;
}

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/video-calls", () => {
  function mockVideoCallList(limitSpy: ReturnType<typeof vi.fn>) {
    mockFrom.mockImplementation((table: string) => {
      if (table === "video_calls") {
        return {
          select: () => ({
            or: () => ({
              order: () => ({
                limit: limitSpy,
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          in: () => Promise.resolve({ data: [], error: null }),
        }),
      };
    });
  }

  it("clamps invalid limit values before querying", async () => {
    const userId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    const limitSpy = vi.fn(() => Promise.resolve({ data: [], error: null }));

    mockGetAuthContext.mockResolvedValue({
      user: { id: userId, authMethod: "session" },
      supabase: supabaseClient,
    } as unknown as AuthContext);
    mockVideoCallList(limitSpy);

    const res = await GET(makeGetRequest({ limit: "-5" }));

    expect(res.status).toBe(200);
    expect(limitSpy).toHaveBeenCalledWith(1);
  });

  it("uses default limit for non-numeric input", async () => {
    const userId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    const limitSpy = vi.fn(() => Promise.resolve({ data: [], error: null }));

    mockGetAuthContext.mockResolvedValue({
      user: { id: userId, authMethod: "session" },
      supabase: supabaseClient,
    } as unknown as AuthContext);
    mockVideoCallList(limitSpy);

    const res = await GET(makeGetRequest({ limit: "abc" }));

    expect(res.status).toBe(200);
    expect(limitSpy).toHaveBeenCalledWith(20);
  });

  it("uses default limit when the parameter is missing", async () => {
    const userId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    const limitSpy = vi.fn(() => Promise.resolve({ data: [], error: null }));

    mockGetAuthContext.mockResolvedValue({
      user: { id: userId, authMethod: "session" },
      supabase: supabaseClient,
    } as unknown as AuthContext);
    mockVideoCallList(limitSpy);

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(200);
    expect(limitSpy).toHaveBeenCalledWith(20);
  });

  it("caps large limit values before querying", async () => {
    const userId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    const limitSpy = vi.fn(() => Promise.resolve({ data: [], error: null }));

    mockGetAuthContext.mockResolvedValue({
      user: { id: userId, authMethod: "session" },
      supabase: supabaseClient,
    } as unknown as AuthContext);
    mockVideoCallList(limitSpy);

    const res = await GET(makeGetRequest({ limit: "999" }));

    expect(res.status).toBe(200);
    expect(limitSpy).toHaveBeenCalledWith(50);
  });
});

// ════════════════════════════════════════════════════════════════════
//  POST /api/video-calls
// ════════════════════════════════════════════════════════════════════

describe("POST /api/video-calls", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await POST(
      makeRequest({ participant_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d" })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid participant_id", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", authMethod: "session" },
      supabase: supabaseClient,
    } as unknown as AuthContext);

    const res = await POST(makeRequest({ participant_id: "not-a-uuid" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Invalid participant ID");
  });

  it("returns 400 when calling yourself", async () => {
    const userId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    mockGetAuthContext.mockResolvedValue({
      user: { id: userId, authMethod: "session" },
      supabase: supabaseClient,
    } as unknown as AuthContext);

    // Profile lookup for participant
    const profileChain = chainResult({
      data: { id: userId, username: "testuser", full_name: "Test User" },
      error: null,
    });
    mockFrom.mockReturnValue(profileChain);

    const res = await POST(makeRequest({ participant_id: userId }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Cannot create a call with yourself");
  });

  it("creates a call and sends email notification", async () => {
    const userId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    const participantId = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
    const callId = "c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f";

    mockGetAuthContext.mockResolvedValue({
      user: { id: userId, authMethod: "session" },
      supabase: supabaseClient,
    } as unknown as AuthContext);

    // Track mockFrom calls to return different chains for different tables
    let fromCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      fromCallCount++;

      if (table === "profiles") {
        // First profiles call: participant lookup
        // Third profiles call: initiator profile for email
        if (fromCallCount === 1) {
          return chainResult({
            data: {
              id: participantId,
              username: "participant",
              full_name: "Participant User",
            },
            error: null,
          });
        }
        // Initiator profile lookup
        return chainResult({
          data: {
            id: userId,
            username: "initiator",
            full_name: "Initiator User",
          },
          error: null,
        });
      }

      if (table === "video_calls") {
        return chainResult({
          data: {
            id: callId,
            room_id: "ugig-abc123def456",
            initiator_id: userId,
            participant_ids: [participantId],
          },
          error: null,
        });
      }

      if (table === "notifications") {
        return chainResult({ data: null, error: null });
      }

      return chainResult({ data: null, error: null });
    });

    // Admin client returns participant email
    mockGetUserById.mockResolvedValue({
      data: {
        user: { email: "participant@example.com" },
      },
    });

    const res = await POST(
      makeRequest({ participant_id: participantId })
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.id).toBe(callId);

    // Verify email was sent
    expect(mockGetUserById).toHaveBeenCalledWith(participantId);
    expect(mockVideoCallInviteEmail).toHaveBeenCalledWith({
      participantName: "Participant User",
      initiatorName: "Initiator User",
      callId,
      gigTitle: null,
      scheduledAt: undefined,
    });
    expect(mockSendEmail).toHaveBeenCalledWith({
      to: "participant@example.com",
      subject: "Test subject",
      html: "<p>test</p>",
      text: "test",
    });
  });

  it("skips email when participant has no email", async () => {
    const userId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    const participantId = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
    const callId = "c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f";

    mockGetAuthContext.mockResolvedValue({
      user: { id: userId, authMethod: "session" },
      supabase: supabaseClient,
    } as unknown as AuthContext);

    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return chainResult({
          data: {
            id: participantId,
            username: "participant",
            full_name: "Participant User",
          },
          error: null,
        });
      }
      if (table === "video_calls") {
        return chainResult({
          data: {
            id: callId,
            room_id: "ugig-abc123def456",
            initiator_id: userId,
            participant_ids: [participantId],
          },
          error: null,
        });
      }
      return chainResult({ data: null, error: null });
    });

    // No email for participant
    mockGetUserById.mockResolvedValue({
      data: { user: null },
    });

    const res = await POST(
      makeRequest({ participant_id: participantId })
    );

    expect(res.status).toBe(201);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
