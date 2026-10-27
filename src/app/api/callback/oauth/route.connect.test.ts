import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const insert = vi.fn(async () => ({ error: null }));
const getAuthContext = vi.fn();

vi.mock("@/lib/auth/get-user", () => ({ getAuthContext: (...a: unknown[]) => getAuthContext(...a) }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    realtime: { disconnect: () => undefined },
    from: () => {
      const q: any = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: null }),
        insert,
        update: () => ({ eq: async () => ({}) }),
      };
      return q;
    },
  }),
}));

import { GET } from "./route";

function callback(cookieState: Record<string, unknown>) {
  const req = new NextRequest("https://ugig.net/api/callback/oauth?code=c&state=s");
  req.cookies.set("coinpay_oauth_state", JSON.stringify(cookieState));
  return req;
}

describe("GET /api/callback/oauth connect mode", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://ugig.net");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/token")
          ? new Response(JSON.stringify({ access_token: "at" }))
          : new Response(JSON.stringify({ sub: "attacker-sub", email: "attacker@example.com" }))
      )
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    insert.mockClear();
  });

  it("refuses a state cookie rewritten to another user's id", async () => {
    getAuthContext.mockResolvedValue({ user: { id: "attacker" } });
    const res = await GET(callback({ state: "s", codeVerifier: "v", mode: "connect", userId: "victim" }));
    expect(res.headers.get("location")).toContain("coinpay=expired");
    expect(insert).not.toHaveBeenCalled();
  });

  it("links CoinPay to the signed-in user who started the flow", async () => {
    getAuthContext.mockResolvedValue({ user: { id: "me" } });
    const res = await GET(callback({ state: "s", codeVerifier: "v", mode: "connect", userId: "me" }));
    expect(res.headers.get("location")).toContain("coinpay=connected");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "me", provider_user_id: "attacker-sub" }));
  });
});
