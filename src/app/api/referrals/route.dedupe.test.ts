import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockCreateServiceClient: vi.fn(),
  mockReferralInviteEmail: vi.fn(),
  mockSendEmail: vi.fn(),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: mocks.mockGetAuthContext,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.mockCreateServiceClient,
}));

vi.mock("@/lib/email", () => ({
  referralInviteEmail: mocks.mockReferralInviteEmail,
  sendEmail: mocks.mockSendEmail,
}));

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/referrals", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function setupSuccessfulInvite() {
  const existingInviteLookup = vi.fn().mockResolvedValue({ data: [], error: null });
  const serviceClient = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
          in: existingInviteLookup,
        })),
      })),
    })),
  };
  mocks.mockCreateServiceClient.mockReturnValue(serviceClient);

  const insertReferrals = vi.fn().mockReturnValue({
    select: vi.fn().mockResolvedValue({
      data: [{ id: "ref1", referred_email: "friend@test.com", status: "pending" }],
      error: null,
    }),
  });
  const authSupabase = {
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  referral_code: "testuser",
                  username: "testuser",
                  full_name: "Test User",
                },
                error: null,
              }),
            })),
          })),
        };
      }

      if (table === "referrals") {
        return { insert: insertReferrals };
      }

      return {};
    }),
  };
  mocks.mockGetAuthContext.mockResolvedValue({
    user: { id: "user1" },
    supabase: authSupabase,
  });

  return { existingInviteLookup, insertReferrals };
}

describe("POST /api/referrals duplicate invite handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockReferralInviteEmail.mockReturnValue({
      subject: "Join ugig.net",
      html: "<p>Join</p>",
      text: "Join",
    });
    mocks.mockSendEmail.mockResolvedValue({ success: true });
  });

  it("deduplicates repeated emails within the same invite request", async () => {
    const { existingInviteLookup, insertReferrals } = setupSuccessfulInvite();

    const res = await POST(
      makePostRequest({
        emails: [" Friend@Test.com ", "friend@test.com", "FRIEND@test.com"],
      })
    );

    expect(res.status).toBe(200);
    expect(existingInviteLookup).toHaveBeenCalledWith("referred_email", ["friend@test.com"]);
    expect(mocks.mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.mockSendEmail).toHaveBeenCalledWith({
      to: "friend@test.com",
      subject: "Join ugig.net",
      html: "<p>Join</p>",
      text: "Join",
    });
    expect(insertReferrals).toHaveBeenCalledWith([
      {
        referrer_id: "user1",
        referred_email: "friend@test.com",
        referral_code: "testuser",
        status: "pending",
      },
    ]);
  });

  it("applies the per-request cap after normalized duplicates are collapsed", async () => {
    const { existingInviteLookup, insertReferrals } = setupSuccessfulInvite();

    const res = await POST(
      makePostRequest({
        emails: Array.from({ length: 21 }, () => " Friend@Test.com "),
      })
    );

    expect(res.status).toBe(200);
    expect(existingInviteLookup).toHaveBeenCalledWith("referred_email", ["friend@test.com"]);
    expect(mocks.mockSendEmail).toHaveBeenCalledTimes(1);
    expect(insertReferrals).toHaveBeenCalledWith([
      {
        referrer_id: "user1",
        referred_email: "friend@test.com",
        referral_code: "testuser",
        status: "pending",
      },
    ]);
  });

  it("only counts new recipients toward the hourly invite limit", async () => {
    const existingInviteLookup = vi.fn().mockResolvedValue({
      data: [{ referred_email: "existing@test.com" }],
      error: null,
    });
    mocks.mockCreateServiceClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            gte: vi.fn().mockResolvedValue({ count: 9, error: null }),
            in: existingInviteLookup,
          })),
        })),
      })),
    });

    const insertReferrals = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: [{ id: "ref1", referred_email: "new@test.com", status: "pending" }],
        error: null,
      }),
    });
    const authSupabase = {
      from: vi.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: {
                    referral_code: "testuser",
                    username: "testuser",
                    full_name: "Test User",
                  },
                  error: null,
                }),
              })),
            })),
          };
        }

        if (table === "referrals") {
          return { insert: insertReferrals };
        }

        return {};
      }),
    };
    mocks.mockGetAuthContext.mockResolvedValue({
      user: { id: "user1" },
      supabase: authSupabase,
    });

    const res = await POST(
      makePostRequest({ emails: ["existing@test.com", "new@test.com"] })
    );

    expect(res.status).toBe(200);
    expect(existingInviteLookup).toHaveBeenCalledWith(
      "referred_email",
      ["existing@test.com", "new@test.com"]
    );
    expect(mocks.mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.mockSendEmail).toHaveBeenCalledWith({
      to: "new@test.com",
      subject: "Join ugig.net",
      html: "<p>Join</p>",
      text: "Join",
    });
    expect(insertReferrals).toHaveBeenCalledWith([
      {
        referrer_id: "user1",
        referred_email: "new@test.com",
        referral_code: "testuser",
        status: "pending",
      },
    ]);
  });
});
