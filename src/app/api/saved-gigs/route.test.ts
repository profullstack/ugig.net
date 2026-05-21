import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

import { DELETE, POST } from "./route";

const mockFrom = vi.fn();
const mockSupabase = {
  from: mockFrom,
};

function makeRequest(method: "POST" | "DELETE", body: string) {
  return new NextRequest("http://localhost/api/saved-gigs", {
    method,
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("saved gigs invalid JSON handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1" },
      supabase: mockSupabase,
    });
  });

  it("returns 400 for malformed POST bodies without querying Supabase", async () => {
    const res = await POST(makeRequest("POST", "{"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid JSON body");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed DELETE bodies without querying Supabase", async () => {
    const res = await DELETE(makeRequest("DELETE", "{"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid JSON body");
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
