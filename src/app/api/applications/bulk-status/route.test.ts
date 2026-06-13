import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PUT } from "./route";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

const mockFrom = vi.fn();

function makeRequest(body: string) {
  return new NextRequest("http://localhost/api/applications/bulk-status", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("PUT /api/applications/bulk-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue({
      user: { id: "poster-1" },
      supabase: { from: mockFrom },
    });
  });

  it("returns 400 for malformed JSON without querying Supabase", async () => {
    const res = await PUT(makeRequest("{"));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid JSON body" });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
