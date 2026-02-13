import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true }),
  rateLimitExceeded: () => new Response("Rate limited", { status: 429 }),
  getRateLimitIdentifier: () => "test",
}));

const mockResend = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      auth: {
        resend: mockResend,
      },
    }),
}));

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/auth/resend-confirmation", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/auth/resend-confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return success message on valid email", async () => {
    mockResend.mockResolvedValue({ error: null });

    const res = await POST(makeRequest({ email: "test@example.com" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain("confirmation link has been sent");
    expect(mockResend).toHaveBeenCalledWith({ type: "signup", email: "test@example.com" });
  });

  it("should return same message even on error (no email leak)", async () => {
    mockResend.mockResolvedValue({ error: { message: "User not found" } });

    const res = await POST(makeRequest({ email: "nonexistent@example.com" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain("confirmation link has been sent");
  });

  it("should return 400 for invalid email", async () => {
    const res = await POST(makeRequest({ email: "not-valid" }));
    expect(res.status).toBe(400);
  });
});
