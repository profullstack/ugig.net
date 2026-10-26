import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getAuthContext = vi.fn();
const upsert = vi.fn();

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: (...args: unknown[]) => getAuthContext(...args),
  requireFullAccess: (auth: { user: { scope?: string } }) =>
    auth.user.scope === "public" ? new Response("{}", { status: 403 }) : null,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    auth: {},
    from: (table: string) => ({
      upsert: (row: Record<string, unknown>, opts: unknown) => {
        upsert(table, row, opts);
        return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
      },
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { full_name: "Ada L." }, error: null }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

import { GET, PATCH } from "./route";

const url = "https://ugig.net/api/v1/me/profile";

describe("/api/v1/me/profile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is 401 JSON when signed out", async () => {
    getAuthContext.mockResolvedValue(null);
    const r = await GET(new NextRequest(url));
    expect(r.status).toBe(401);
    expect(await r.json()).toHaveProperty("error");
  });

  it("refuses a public (listing) API key", async () => {
    getAuthContext.mockResolvedValue({ user: { id: "u1", scope: "public" } });
    const r = await GET(new NextRequest(url));
    expect(r.status).toBe(401);
  });

  it("PATCH saves normalized fields to user_profiles", async () => {
    getAuthContext.mockResolvedValue({ user: { id: "u1", email: "ada@acme.com" } });
    const r = await PATCH(
      new NextRequest(url, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job_title: "  CTO ", company_domain: "https://www.Acme.com" }),
      })
    );
    expect(r.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      "user_profiles",
      expect.objectContaining({ user_id: "u1", job_title: "CTO", company_domain: "acme.com" }),
      { onConflict: "user_id" }
    );
  });
});
