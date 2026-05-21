import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mockUpdateUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      auth: {
        updateUser: mockUpdateUser,
      },
    }),
}));

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeRawRequest(body: string) {
  return new NextRequest("http://localhost/api/auth/reset-password", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/auth/reset-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the password for a valid request", async () => {
    mockUpdateUser.mockResolvedValue({ error: null });

    const res = await POST(makeRequest({ password: "Valid-password-123" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toBe("Password updated successfully");
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "Valid-password-123" });
  });

  it("returns 400 for an invalid password", async () => {
    const res = await POST(makeRequest({ password: "short" }));
    expect(res.status).toBe(400);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON without updating the password", async () => {
    const res = await POST(makeRawRequest("{"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid request body");
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});
