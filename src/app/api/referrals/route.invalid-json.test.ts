import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockCreateServiceClient: vi.fn(),
  mockSendEmail: vi.fn(),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: mocks.mockGetAuthContext,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.mockCreateServiceClient,
}));

vi.mock("@/lib/email", () => ({
  referralInviteEmail: vi.fn(),
  sendEmail: mocks.mockSendEmail,
}));

function makeRawPostRequest(body: BodyInit) {
  return new NextRequest("http://localhost/api/referrals", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/referrals invalid JSON handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetAuthContext.mockResolvedValue({
      user: { id: "user1" },
      supabase: { from: vi.fn() },
    });
  });

  it("returns 400 for malformed JSON before referral side effects", async () => {
    const res = await POST(makeRawPostRequest("{not valid json"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid JSON body");
    expect(mocks.mockCreateServiceClient).not.toHaveBeenCalled();
    expect(mocks.mockSendEmail).not.toHaveBeenCalled();
  });
});
