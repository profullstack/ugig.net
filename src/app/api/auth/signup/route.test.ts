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
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
  signupConfirmationEmail: vi.fn((params: { confirmUrl: string }) => ({
    subject: "Confirm your ugig.net account",
    html: params.confirmUrl,
    text: params.confirmUrl,
  })),
}));

const mockGenerateLink = vi.fn();
const mockListUsers = vi.fn();
const mockActivityInsert = vi.fn();
const mockCreateClient = vi.fn();
const mockCreateServiceClient = vi.fn();
const mockProfileUpsert = vi.fn();
const mockProfilesUpdate = vi.fn();

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

    mockGenerateLink.mockResolvedValue({
      data: {
        user: { id: "new-user-id" },
        properties: { hashed_token: "signup-token" },
      },
      error: null,
    });

    mockCreateClient.mockResolvedValue({
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
      auth: {
        admin: {
          generateLink: mockGenerateLink,
          listUsers: mockListUsers,
        },
      },
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
            update: (row: unknown) => ({
              eq: (col: string, val: unknown) => mockProfilesUpdate(row, col, val),
            }),
          };
        }

        if (table === "user_profiles") {
          return {
            upsert: (row: Record<string, unknown>, opts: unknown) => {
              mockProfileUpsert(row, opts);
              return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
            },
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
    mockListUsers.mockResolvedValue({
      data: {
        users: [
          {
            email: "new-user@example.com",
            email_confirmed_at: null,
            user_metadata: { username: "newuser" },
          },
        ],
      },
      error: null,
    });
  });

  it("does not include referred email in public referral activity metadata", async () => {
    const res = await POST(
      makeRequest({
        email: "new-user@example.com",
        password: "Goodpass1",
        username: "newuser",
        account_type: "human",
        first_name: "Ada",
        last_name: "Lovelace",
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
    expect(mockActivityInsert.mock.calls[0][0].metadata).not.toHaveProperty("referred_email");
  });

  it("refuses a random-letters username before creating anything", async () => {
    const res = await POST(
      makeRequest({
        email: "new-user@example.com",
        password: "Goodpass1",
        username: "kdrmtwwz",
        account_type: "human",
        first_name: "Ada",
        last_name: "Lovelace",
      })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/random letters/);
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });

  it("sends signup confirmation email through app mailer", async () => {
    const { sendEmail, signupConfirmationEmail } = await import("@/lib/email");

    const res = await POST(
      makeRequest({
        email: "new-user@example.com",
        password: "Goodpass1",
        username: "newuser",
        account_type: "human",
        first_name: "Ada",
        last_name: "Lovelace",
      })
    );

    expect(res.status).toBe(200);
    expect(mockGenerateLink).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "signup",
        email: "new-user@example.com",
        password: "Goodpass1",
      })
    );
    expect(signupConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "newuser",
        confirmUrl: "https://ugig.net/auth/confirm?token_hash=signup-token&type=signup",
      })
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "new-user@example.com",
        subject: "Confirm your ugig.net account",
      })
    );
  });

  it("resends confirmation for an already registered unconfirmed email", async () => {
    const { sendEmail } = await import("@/lib/email");
    mockGenerateLink
      .mockResolvedValueOnce({
        data: {},
        error: {
          message: "A user with this email address has already been registered",
          status: 400,
          code: "email_exists",
        },
      })
      .mockResolvedValueOnce({
        data: {
          user: { id: "existing-user-id" },
          properties: { hashed_token: "resend-token" },
        },
        error: null,
      });

    const res = await POST(
      makeRequest({
        email: "new-user@example.com",
        password: "Goodpass1",
        username: "unusednewuser",
        account_type: "human",
        first_name: "Ada",
        last_name: "Lovelace",
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resent).toBe(true);
    expect(mockGenerateLink).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: "magiclink",
        email: "new-user@example.com",
      })
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "new-user@example.com",
        html: "https://ugig.net/auth/confirm?token_hash=resend-token&type=magiclink&next=%2Fdashboard",
      })
    );
  });

  it("stores the profile fields in user_profiles after creating a person's account", async () => {
    const res = await POST(
      makeRequest({
        email: "Ada@Acme.com",
        password: "Goodpass1",
        username: "adalovelace",
        account_type: "human",
        first_name: "Ada",
        last_name: "Lovelace",
        company_domain: "https://www.acme.com/about",
        job_title: "VP Engineering",
        linkedin_url: "in/ada-lovelace",
      })
    );

    expect(res.status).toBe(200);
    expect(mockProfileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "new-user-id",
        email: "ada@acme.com",
        first_name: "Ada",
        last_name: "Lovelace",
        company_domain: "acme.com",
        job_title: "VP Engineering",
        linkedin_url: "https://www.linkedin.com/in/ada-lovelace",
      }),
      { onConflict: "user_id" }
    );
    // profiles.full_name was empty, so it is filled from the names.
    expect(mockProfilesUpdate).toHaveBeenCalledWith({ full_name: "Ada Lovelace" }, "id", "new-user-id");
  });

  it("refuses a person's signup without first and last name before creating anything", async () => {
    const res = await POST(
      makeRequest({
        email: "new-user@example.com",
        password: "Goodpass1",
        username: "newuser",
        account_type: "human",
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(Object.keys(body.errors)).toEqual(expect.arrayContaining(["first_name", "last_name"]));
    expect(mockGenerateLink).not.toHaveBeenCalled();
    expect(mockProfileUpsert).not.toHaveBeenCalled();
  });

  it("does not ask agents for names or write a person profile for them", async () => {
    const res = await POST(
      makeRequest({
        email: "agent@example.com",
        password: "Goodpass1",
        username: "helpful-agent",
        account_type: "agent",
        agent_name: "Helpful Agent",
      })
    );

    expect(res.status).toBe(200);
    expect(mockGenerateLink).toHaveBeenCalled();
    expect(mockProfileUpsert).not.toHaveBeenCalled();
  });
});
