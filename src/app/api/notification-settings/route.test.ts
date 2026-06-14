import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PUT } from "./route";

const mocks = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: mocks.mockGetAuthContext,
}));

function makePutRequest(body: BodyInit) {
  return new NextRequest("http://localhost/api/notification-settings", {
    method: "PUT",
    body,
    headers: { "Content-Type": "application/json" },
  });
}

describe("PUT /api/notification-settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1" },
      supabase: { from: mocks.mockFrom },
    });
  });

  it("returns 400 for malformed JSON before touching settings", async () => {
    const response = await PUT(makePutRequest("{not valid json"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid JSON body");
    expect(mocks.mockFrom).not.toHaveBeenCalled();
  });
});
