import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

function makeRequest() {
  return new NextRequest("http://localhost/api/referrals/code", { method: "GET" });
}

describe("GET /api/referrals/code", () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    if (originalAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    }
  });

  it("should return 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("should return referral code and link", async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: { referral_code: "johndoe", username: "johndoe" },
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

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toBe("johndoe");
    expect(body.link).toBe("http://localhost/?ref=johndoe");
  });

  it("should prefer configured app URL and encode referral code", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://staging.ugig.net/";
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: { referral_code: "ref code/1", username: "johndoe" },
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

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toBe("ref code/1");
    expect(body.link).toBe("https://staging.ugig.net/?ref=ref%20code%2F1");
  });

  it("should return 404 when profile not found", async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({ data: null, error: { message: "Not found" } }),
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
