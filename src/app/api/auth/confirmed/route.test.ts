import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";

// Mock supabase
const mockSingle = vi.fn();
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}));

// Mock email
const mockSendEmail = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  welcomeEmail: vi.fn(({ name, accountType }: { name: string; accountType?: string }) => ({
    subject: `Welcome ${name}`,
    html: `<p>Welcome ${name} (${accountType})</p>`,
    text: `Welcome ${name}`,
  })),
}));

function makeRequest(body: unknown, secret?: string): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (secret) {
    headers["authorization"] = `Bearer ${secret}`;
  }
  return new NextRequest("http://localhost/api/auth/confirmed", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/confirmed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no webhook secret required
    delete process.env.AUTH_WEBHOOK_SECRET;
  });

  it("should send welcome email on new email confirmation", async () => {
    mockSingle.mockResolvedValue({
      data: { username: "testuser", full_name: "Test User", account_type: "human" },
      error: null,
    });

    const res = await POST(
      makeRequest({
        type: "UPDATE",
        record: {
          id: "user-123",
          email: "test@example.com",
          email_confirmed_at: "2026-02-13T00:00:00Z",
        },
        old_record: {
          id: "user-123",
          email: "test@example.com",
          email_confirmed_at: null,
        },
      })
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.emailSent).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "test@example.com",
        subject: "Welcome Test User",
      })
    );
  });

  it("should send agent-specific welcome for agent accounts", async () => {
    mockSingle.mockResolvedValue({
      data: { username: "myagent", full_name: null, account_type: "agent" },
      error: null,
    });

    const res = await POST(
      makeRequest({
        type: "UPDATE",
        record: {
          id: "agent-123",
          email: "agent@example.com",
          email_confirmed_at: "2026-02-13T00:00:00Z",
        },
        old_record: {
          id: "agent-123",
          email: "agent@example.com",
          email_confirmed_at: null,
        },
      })
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.emailSent).toBe(true);
  });

  it("should skip if email was already confirmed", async () => {
    const res = await POST(
      makeRequest({
        type: "UPDATE",
        record: {
          id: "user-123",
          email: "test@example.com",
          email_confirmed_at: "2026-02-13T00:00:00Z",
        },
        old_record: {
          id: "user-123",
          email: "test@example.com",
          email_confirmed_at: "2026-02-12T00:00:00Z",
        },
      })
    );

    const json = await res.json();
    expect(json.skipped).toBe(true);
    expect(json.reason).toBe("already_confirmed");
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("should skip if email not confirmed yet", async () => {
    const res = await POST(
      makeRequest({
        type: "UPDATE",
        record: {
          id: "user-123",
          email: "test@example.com",
          email_confirmed_at: null,
        },
        old_record: {
          id: "user-123",
          email: "test@example.com",
          email_confirmed_at: null,
        },
      })
    );

    const json = await res.json();
    expect(json.skipped).toBe(true);
    expect(json.reason).toBe("not_confirmed");
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("should reject unauthorized requests when secret is configured", async () => {
    process.env.AUTH_WEBHOOK_SECRET = "my-secret";

    const res = await POST(
      makeRequest(
        {
          type: "UPDATE",
          record: { id: "user-123", email: "test@example.com", email_confirmed_at: "2026-02-13T00:00:00Z" },
          old_record: { id: "user-123", email: "test@example.com", email_confirmed_at: null },
        },
        "wrong-secret"
      )
    );

    expect(res.status).toBe(401);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("should accept authorized requests when secret matches", async () => {
    process.env.AUTH_WEBHOOK_SECRET = "my-secret";
    mockSingle.mockResolvedValue({
      data: { username: "testuser", full_name: null, account_type: "human" },
      error: null,
    });

    const res = await POST(
      makeRequest(
        {
          type: "UPDATE",
          record: { id: "user-123", email: "test@example.com", email_confirmed_at: "2026-02-13T00:00:00Z" },
          old_record: { id: "user-123", email: "test@example.com", email_confirmed_at: null },
        },
        "my-secret"
      )
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.emailSent).toBe(true);
  });

  it("should return 400 for missing user data", async () => {
    const res = await POST(
      makeRequest({
        type: "UPDATE",
        record: { email_confirmed_at: "2026-02-13T00:00:00Z" },
        old_record: { email_confirmed_at: null },
      })
    );

    expect(res.status).toBe(400);
  });
});
