import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

function makeRequest(origin = "http://localhost") {
  return new NextRequest(`${origin}/api/referrals/code`, { method: "GET" });
}

function mockProfile(profile: { referral_code: string | null; username: string }) {
  const mockSupabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: profile,
              error: null,
            }),
        }),
      }),
    }),
  };

  mockGetAuthContext.mockResolvedValue({
    user: { id: "user1" },
    supabase: mockSupabase,
  });
}

describe("GET /api/referrals/code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("should return 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("should return referral code and link", async () => {
    mockProfile({ referral_code: "johndoe", username: "johndoe" });

    const res = await GET(makeRequest("https://preview.ugig.example"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toBe("johndoe");
    expect(body.link).toBe("https://preview.ugig.example/?ref=johndoe");
  });

  it("should prefer configured app URL and encode referral code", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://staging.ugig.example/");
    mockProfile({ referral_code: "code/with space", username: "johndoe" });

    const res = await GET(makeRequest("https://preview.ugig.example"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toBe("code/with space");
    expect(body.link).toBe("https://staging.ugig.example/?ref=code%2Fwith%20space");
  });

  it("should return 404 when profile not found", async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null, error: { message: "Not found" } }),
          }),
        }),
      }),
    };

    mockGetAuthContext.mockResolvedValue({
      user: { id: "user1" },
      supabase: mockSupabase,
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
  });
});
