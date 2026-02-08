import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

// ── Mocks ──────────────────────────────────────────────────────────

const mockSelect = vi.fn();
const mockIlike = vi.fn();
const mockLimit = vi.fn();

const supabaseClient = {
  from: vi.fn(() => ({
    select: mockSelect,
  })),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseClient)),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

import { getAuthContext } from "@/lib/auth/get-user";

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(url: string) {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

// ── Tests ──────────────────────────────────────────────────────────

describe("GET /api/users/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ ilike: mockIlike });
    mockIlike.mockReturnValue({ limit: mockLimit });
  });

  it("returns 401 if not authenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);

    const res = await GET(makeRequest("/api/users/search?q=test"));
    expect(res.status).toBe(401);
  });

  it("returns empty array for empty query", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: supabaseClient as any,
    });

    const res = await GET(makeRequest("/api/users/search?q="));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.users).toEqual([]);
  });

  it("returns empty array when no query param", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: supabaseClient as any,
    });

    const res = await GET(makeRequest("/api/users/search"));
    const data = await res.json();
    expect(data.users).toEqual([]);
  });

  it("searches users by prefix and returns only safe fields", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: supabaseClient as any,
    });

    mockLimit.mockResolvedValue({
      data: [
        {
          id: "uuid-1",
          username: "chovy",
          avatar_url: "https://example.com/avatar.jpg",
        },
      ],
      error: null,
    });

    const res = await GET(makeRequest("/api/users/search?q=cho"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.users).toHaveLength(1);
    expect(data.users[0]).toEqual({
      id: "uuid-1",
      username: "chovy",
      avatar_url: "https://example.com/avatar.jpg",
    });

    // Verify only safe fields selected
    expect(mockSelect).toHaveBeenCalledWith("id, username, avatar_url");
    expect(mockIlike).toHaveBeenCalledWith("username", "cho%");
  });

  it("does NOT leak email, full_name, or phone", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: supabaseClient as any,
    });

    mockLimit.mockResolvedValue({
      data: [
        {
          id: "uuid-1",
          username: "chovy",
          avatar_url: null,
          email: "chovy@example.com",
          full_name: "Chovy Real Name",
          phone: "+1234567890",
        },
      ],
      error: null,
    });

    const res = await GET(makeRequest("/api/users/search?q=cho"));
    const data = await res.json();

    // Even if supabase returned extra fields, API must strip them
    const user = data.users[0];
    expect(user).not.toHaveProperty("email");
    expect(user).not.toHaveProperty("full_name");
    expect(user).not.toHaveProperty("phone");
    expect(Object.keys(user)).toEqual(["id", "username", "avatar_url"]);
  });

  it("respects limit parameter with max 20", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: supabaseClient as any,
    });

    mockLimit.mockResolvedValue({ data: [], error: null });

    await GET(makeRequest("/api/users/search?q=test&limit=50"));
    expect(mockLimit).toHaveBeenCalledWith(20);
  });

  it("uses default limit of 10", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      user: { id: "user-1", authMethod: "session" },
      supabase: supabaseClient as any,
    });

    mockLimit.mockResolvedValue({ data: [], error: null });

    await GET(makeRequest("/api/users/search?q=test"));
    expect(mockLimit).toHaveBeenCalledWith(10);
  });
});
