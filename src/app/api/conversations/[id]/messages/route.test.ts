import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(),
  newMessageEmail: vi.fn(),
}));

vi.mock("@/lib/webhooks/dispatch", () => ({
  dispatchWebhookAsync: vi.fn(),
}));

vi.mock("@/lib/notification-settings", () => ({
  isEmailNotificationEnabled: vi.fn(),
}));

const mockGetAuthContext = vi.mocked(getAuthContext);
const userId = "user-1";
const conversationId = "conversation-1";

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL(`http://localhost/api/conversations/${conversationId}/messages`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

function params() {
  return { params: Promise.resolve({ id: conversationId }) };
}

function mockSupabase(limitSpy: ReturnType<typeof vi.fn>) {
  return {
    from: vi.fn((table: string) => {
      if (table === "conversations") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { participant_ids: [userId, "user-2"] },
                  error: null,
                }),
            }),
          }),
        };
      }

      if (table === "messages") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: limitSpy,
              }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ data: null, error: null }),
          }),
        };
      }

      return {};
    }),
  };
}

async function expectMessageLimit(input: Record<string, string>, expectedLimit: number) {
  const limitSpy = vi.fn(() => Promise.resolve({ data: [], error: null }));
  const supabase = mockSupabase(limitSpy);

  mockGetAuthContext.mockResolvedValue({
    user: { id: userId, authMethod: "session" },
    supabase,
  } as any);

  const res = await GET(makeRequest(input), params());

  expect(res.status).toBe(200);
  expect(limitSpy).toHaveBeenCalledWith(expectedLimit + 1);
}

describe("GET /api/conversations/[id]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await GET(makeRequest(), params());

    expect(res.status).toBe(401);
  });

  it("clamps negative limit values before querying messages", async () => {
    await expectMessageLimit({ limit: "-5" }, 1);
  });

  it("uses the default limit for non-numeric input", async () => {
    await expectMessageLimit({ limit: "abc" }, 50);
  });

  it("uses the default limit when the parameter is missing", async () => {
    await expectMessageLimit({}, 50);
  });

  it("passes through valid in-range limit values", async () => {
    await expectMessageLimit({ limit: "25" }, 25);
  });

  it("caps large limit values before querying messages", async () => {
    await expectMessageLimit({ limit: "999" }, 100);
  });
});
