import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";

// Mock rate limit
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true }),
  rateLimitExceeded: () => new Response("Rate limited", { status: 429 }),
  getRateLimitIdentifier: () => "test",
}));

// Mock supabase
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      auth: {
        signInWithPassword: mockSignInWithPassword,
        signOut: mockSignOut,
      },
    }),
}));

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 for invalid credentials", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });

    const res = await POST(makeRequest({ email: "test@x.com", password: "Bad1pass" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid login credentials");
  });

  it("should return 200 for confirmed user", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: { id: "u1", email: "test@x.com", email_confirmed_at: "2026-01-01T00:00:00Z" },
        session: { access_token: "tok" },
      },
      error: null,
    });

    const res = await POST(makeRequest({ email: "test@x.com", password: "Good1pass" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Login successful");
  });

  it("should return 403 for unconfirmed user", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: { id: "u1", email: "test@x.com", email_confirmed_at: null },
        session: { access_token: "tok" },
      },
      error: null,
    });
    mockSignOut.mockResolvedValue({ error: null });

    const res = await POST(makeRequest({ email: "test@x.com", password: "Good1pass" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("EMAIL_NOT_CONFIRMED");
    expect(body.error).toContain("confirm your email");
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("should return 400 for invalid input", async () => {
    const res = await POST(makeRequest({ email: "not-an-email", password: "" }));
    expect(res.status).toBe(400);
  });
});
