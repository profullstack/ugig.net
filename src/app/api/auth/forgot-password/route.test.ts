import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mockResetPasswordForEmail = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      auth: {
        resetPasswordForEmail: mockResetPasswordForEmail,
      },
    }),
}));

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeRawRequest(body: string) {
  return new NextRequest("http://localhost/api/auth/forgot-password", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("sends a reset link for a valid email", async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null });

    const res = await POST(makeRequest({ email: "test@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toContain("password reset link");
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
      "test@example.com",
      expect.objectContaining({ redirectTo: "https://ugig.net/auth/confirm" })
    );
  });

  it("returns 400 for invalid email", async () => {
    const res = await POST(makeRequest({ email: "invalid" }));
    expect(res.status).toBe(400);
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON without sending a reset link", async () => {
    const res = await POST(makeRawRequest("{"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid request body");
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });
});
