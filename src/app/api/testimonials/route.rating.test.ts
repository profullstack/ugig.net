import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockCreateServiceClient: vi.fn(),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: mocks.mockGetAuthContext,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.mockCreateServiceClient,
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(),
}));

describe("POST /api/testimonials rating validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetAuthContext.mockResolvedValue({
      user: { id: "author-1" },
      supabase: {},
    });
  });

  it("rejects fractional ratings before creating a service client", async () => {
    const request = new NextRequest("http://localhost/api/testimonials", {
      method: "POST",
      body: JSON.stringify({
        profile_id: "profile-1",
        rating: 4.5,
        content: "Consistent and helpful work.",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Rating must be an integer from 1-5");
    expect(mocks.mockCreateServiceClient).not.toHaveBeenCalled();
  });
});
