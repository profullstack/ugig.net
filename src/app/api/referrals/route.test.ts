// @ts-nocheck - test mocks don't match strict Supabase types
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "./route";
import { NextRequest } from "next/server";

// Mock auth
const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

const mockCreateServiceClient = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => mockCreateServiceClient(),
}));

const mockSendEmail = vi.fn();
const mockReferralInviteEmail = vi.fn();
vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  referralInviteEmail: (...args: unknown[]) => mockReferralInviteEmail(...args),
}));

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockSingle = vi.fn();

const mockSupabase = {
  from: vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
  })),
};

function makeServiceClientWithReferralCounts({
  hourlyCount = 0,
  dailyCount = 0,
  existingInvites = [],
}: {
  hourlyCount?: number;
  dailyCount?: number;
  existingInvites?: Array<{ referred_email: string }>;
} = {}) {
  let referralsQueryCount = 0;

  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockImplementation(() => {
            referralsQueryCount += 1;
            return Promise.resolve({
              count: referralsQueryCount === 1 ? hourlyCount : dailyCount,
              error: null,
            });
          }),
          in: vi.fn().mockResolvedValue({ data: existingInvites, error: null }),
        }),
      }),
    })),
  };
}

function makeServiceClientWithNoExistingReferrals() {
  return makeServiceClientWithReferralCounts();
}

function makeGetRequest() {
  return new NextRequest("http://localhost/api/referrals", { method: "GET" });
}

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/referrals", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeRawPostRequest(body: string) {
  return new NextRequest("http://localhost/api/referrals", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GET /api/referrals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateServiceClient.mockReturnValue(makeServiceClientWithNoExistingReferrals());
    mockReferralInviteEmail.mockReturnValue({
      subject: "Join ugig.net",
      html: "<p>Join</p>",
      text: "Join",
    });
    mockSendEmail.mockResolvedValue({ success: true });
  });

  it("should return 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("should return referrals with stats", async () => {
    const referrals = [
      { id: "1", referred_email: "a@b.com", status: "pending" },
      { id: "2", referred_email: "c@d.com", status: "registered" },
    ];

    mockGetAuthContext.mockResolvedValue({
      user: { id: "user1" },
      supabase: mockSupabase,
    });

    mockOrder.mockResolvedValue({ data: referrals, error: null });
    mockEq.mockReturnValue({ order: mockOrder });
    mockSelect.mockReturnValue({ eq: mockEq });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.stats.total_invited).toBe(2);
    expect(body.stats.total_registered).toBe(1);
    expect(body.stats.conversion_rate).toBe(50);
  });
});

describe("POST /api/referrals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateServiceClient.mockReturnValue(makeServiceClientWithNoExistingReferrals());
  });

  it("should return 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await POST(makePostRequest({ emails: ["a@b.com"] }));
    expect(res.status).toBe(401);
  });

  it("should return 400 for missing emails", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user1" },
      supabase: mockSupabase,
    });

    const res = await POST(makePostRequest({ emails: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("array of emails");
  });

  it("should return 400 for malformed JSON", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user1" },
      supabase: mockSupabase,
    });

    const res = await POST(makeRawPostRequest("{"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("array of emails");
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });

  it("should return 400 for non-string email entries", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user1" },
      supabase: mockSupabase,
    });

    const res = await POST(makePostRequest({ emails: [123, "friend@test.com"] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("email strings");
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });

  it("should return 400 for too many emails", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user1" },
      supabase: mockSupabase,
    });

    const emails = Array.from({ length: 21 }, (_, i) => `user${i}@test.com`);
    const res = await POST(makePostRequest({ emails }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Maximum 20");
  });

  it("should return 400 before side effects when inviting only your own email", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user1", email: "Owner@Test.com" },
      supabase: mockSupabase,
    });

    const res = await POST(makePostRequest({ emails: [" owner@test.com "] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("own email");
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("should create referrals for valid emails", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user1" },
      supabase: mockSupabase,
    });

    const mockSelectChain = {
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { referral_code: "testuser", username: "testuser", full_name: "Test User" },
          error: null,
        }),
      }),
    };
    const mockInsertChain = {
      select: vi.fn().mockResolvedValue({
        data: [{ id: "ref1", referred_email: "friend@test.com", status: "pending" }],
        error: null,
      }),
    };

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return { select: () => mockSelectChain };
      if (table === "referrals") return { insert: () => mockInsertChain };
      return {};
    });

    const res = await POST(makePostRequest({ emails: ["friend@test.com"] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain("1 invite(s) created and sent");
    expect(body.email_delivery_failed).toBe(0);
    expect(mockReferralInviteEmail).toHaveBeenCalledWith({
      inviterName: "Test User",
      referralCode: "testuser",
    });
    expect(mockSendEmail).toHaveBeenCalledWith({
      to: "friend@test.com",
      subject: "Join ugig.net",
      html: "<p>Join</p>",
      text: "Join",
    });
  });

  it("should deduplicate normalized emails before creating referrals", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user1" },
      supabase: mockSupabase,
    });

    let insertedRows: Array<{ referred_email: string }> = [];
    const mockSelectChain = {
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { referral_code: "testuser", username: "testuser", full_name: "Test User" },
          error: null,
        }),
      }),
    };
    const mockInsertChain = {
      select: vi.fn().mockImplementation(() =>
        Promise.resolve({
          data: insertedRows.map((row, index) => ({
            id: `ref${index + 1}`,
            referred_email: row.referred_email,
            status: "pending",
          })),
          error: null,
        })
      ),
    };
    const mockInsertRows = vi.fn().mockImplementation((rows) => {
      insertedRows = rows;
      return mockInsertChain;
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return { select: () => mockSelectChain };
      if (table === "referrals") return { insert: mockInsertRows };
      return {};
    });

    const res = await POST(makePostRequest({
      emails: ["Friend@Test.com", " friend@test.com ", "other@test.com"],
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain("2 invite(s) created and sent");
    expect(insertedRows.map((row) => row.referred_email)).toEqual([
      "friend@test.com",
      "other@test.com",
    ]);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenNthCalledWith(1, {
      to: "friend@test.com",
      subject: "Join ugig.net",
      html: "<p>Join</p>",
      text: "Join",
    });
    expect(mockSendEmail).toHaveBeenNthCalledWith(2, {
      to: "other@test.com",
      subject: "Join ugig.net",
      html: "<p>Join</p>",
      text: "Join",
    });
  });

  it("should keep created invites when email delivery fails", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user1" },
      supabase: mockSupabase,
    });
    mockSendEmail.mockResolvedValueOnce({ success: false, error: "resend failed" });

    const mockSelectChain = {
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { referral_code: null, username: "testuser", full_name: null },
          error: null,
        }),
      }),
    };
    const mockInsertChain = {
      select: vi.fn().mockResolvedValue({
        data: [{ id: "ref1", referred_email: "friend@test.com", status: "pending" }],
        error: null,
      }),
    };

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return { select: () => mockSelectChain };
      if (table === "referrals") return { insert: () => mockInsertChain };
      return {};
    });

    const res = await POST(makePostRequest({ emails: ["friend@test.com"] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain("1 email(s) failed to send");
    expect(body.email_delivery_failed).toBe(1);
    expect(mockReferralInviteEmail).toHaveBeenCalledWith({
      inviterName: "testuser",
      referralCode: "testuser",
    });
  });

  it("should return 400 before side effects for invalid emails only", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user1" },
      supabase: mockSupabase,
    });

    const res = await POST(makePostRequest({ emails: ["not-an-email", "also-bad"] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("No valid email");
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("should not count invalid email syntax against invite limits", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user1" },
      supabase: mockSupabase,
    });
    mockCreateServiceClient.mockReturnValue(makeServiceClientWithReferralCounts({
      hourlyCount: 9,
    }));
    mockReferralInviteEmail.mockReturnValue({
      subject: "Join ugig.net",
      html: "<p>Join</p>",
      text: "Join",
    });
    mockSendEmail.mockResolvedValue({ success: true });

    let insertedRows: Array<{ referred_email: string }> = [];
    const mockSelectChain = {
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { referral_code: "testuser", username: "testuser", full_name: "Test User" },
          error: null,
        }),
      }),
    };
    const mockInsertChain = {
      select: vi.fn().mockImplementation(() =>
        Promise.resolve({
          data: insertedRows.map((row, index) => ({
            id: `ref${index + 1}`,
            referred_email: row.referred_email,
            status: "pending",
          })),
          error: null,
        })
      ),
    };
    const mockInsertRows = vi.fn().mockImplementation((rows) => {
      insertedRows = rows;
      return mockInsertChain;
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return { select: () => mockSelectChain };
      if (table === "referrals") return { insert: mockInsertRows };
      return {};
    });

    const res = await POST(makePostRequest({ emails: ["not-an-email", "friend@test.com"] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain("1 invite(s) created and sent");
    expect(insertedRows.map((row) => row.referred_email)).toEqual(["friend@test.com"]);
  });
});
