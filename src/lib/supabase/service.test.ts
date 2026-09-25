import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser },
    realtime: { disconnect: vi.fn() },
    removeAllChannels: vi.fn(),
  })),
}));

import { authenticateWithToken, isJwtShaped } from "./service";

describe("isJwtShaped", () => {
  it("accepts a JWT", () => {
    expect(isJwtShaped("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl")).toBe(true);
  });

  it("rejects an API key and other tokens", () => {
    expect(isJwtShaped("ugig_live_0123456789abcdef")).toBe(false);
    expect(isJwtShaped("not a token")).toBe(false);
    expect(isJwtShaped("a.b")).toBe(false);
  });
});

describe("authenticateWithToken", () => {
  beforeEach(() => {
    getUser.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  });

  it("never sends an API key to GoTrue", async () => {
    expect(await authenticateWithToken("Bearer ugig_live_0123456789abcdef")).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("still verifies a JWT with GoTrue", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const r = await authenticateWithToken("Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl");
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(r?.user.id).toBe("u1");
  });
});
