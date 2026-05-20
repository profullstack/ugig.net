// @ts-nocheck - route tests use small Supabase-shaped mocks
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true }),
  rateLimitExceeded: () => new Response("Rate limited", { status: 429 }),
  getRateLimitIdentifier: () => "test",
}));

vi.mock("@/lib/spam-check", () => ({
  checkSpam: () => ({ spam: false }),
  checkEmail: () => ({ spam: false }),
}));

vi.mock("@/lib/auth/did", () => ({
  generateAndStoreDid: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/account-type-detection", () => ({
  detectSuspiciousAccountType: () => ({ suspicious: false }),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(),
  welcomeEmail: vi.fn(),
}));

const mockSignUp = vi.fn();
const mockActivityInsert = vi.fn();
const mockCreateClient = vi.fn();
const mockCreateServiceClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockCreateClient(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => mockCreateServiceClient(),
}));

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeEqChain(finalResult: unknown = {}) {
  const chain = {
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn().mockResolvedValue(finalResult),
  };
  return chain;
}

function makeReferralUpdateChain() {
  const chain = {
    eq: vi.fn(() => chain),
  };
  return chain;
}

describe("POST /api/auth/signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSignUp.mockResolvedValue({
      data: { user: { id: "new-user-id" } },
      error: null,
    });

    mockCreateClient.mockResolvedValue({
      auth: { signUp: mockSignUp },
      from: vi.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }
        return {};
      }),
    });

    mockActivityInsert.mockResolvedValue({ data: null, error: null });

    mockCreateServiceClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "referrer-id" },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "referrals") {
          return {
            update: vi.fn(() => makeReferralUpdateChain()),
            select: vi.fn(() => makeEqChain({ data: null, error: null })),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }

        if (table === "activities") {
          return {
            insert: mockActivityInsert,
          };
        }

        return {
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    });
  });

  it("does not include referred email in public referral activity metadata", async () => {
    const res = await POST(
      makeRequest({
        email: "new-user@example.com",
        password: "Goodpass1",
        username: "newuser",
        account_type: "human",
        ref: "referrer",
      })
    );

    expect(res.status).toBe(200);
    expect(mockActivityInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        activity_type: "referral_signup",
        is_public: true,
        metadata: { referred_username: "newuser" },
      })
    );
    expect(mockActivityInsert.mock.calls[0][0].metadata).not.toHaveProperty(
      "referred_email"
    );
  });
});
