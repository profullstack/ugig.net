import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeSupabase } from "@/lib/orders/fake-supabase.test-helper";

const state = vi.hoisted(() => ({
  db: null as any,
  user: { id: "u1" } as { id: string } | null,
  rows: [] as Record<string, unknown>[],
  upserts: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(async () => (state.user ? { user: state.user, supabase: state.db.client } : null)),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => state.db.client }));

import { GET, PUT, DELETE } from "./route";

function req(body?: unknown) {
  return { json: async () => body, headers: new Headers() } as any;
}

describe("/api/profile/payout-paypal", () => {
  beforeEach(() => {
    state.user = { id: "u1" };
    state.db = fakeSupabase({ seller_payout_settings: [] });
    state.db.client.from = vi.fn((t: string) => {
      const b = fakeSupabase({ seller_payout_settings: state.rows }).client.from(t);
      b.upsert = vi.fn(async (row: Record<string, unknown>) => {
        state.upserts.push(row);
        state.rows = [row];
        return { error: null };
      });
      return b;
    });
    state.rows = [];
    state.upserts = [];
  });

  it("requires sign-in", async () => {
    state.user = null;
    expect((await GET(req())).status).toBe(401);
    expect((await PUT(req({ paypal_email: "a@b.co" }))).status).toBe(401);
  });

  it("saves a normalised email for the caller only", async () => {
    const res = await PUT(req({ paypal_email: " Lily@Example.com " }));
    expect(res.status).toBe(200);
    expect(state.upserts[0]).toMatchObject({ user_id: "u1", paypal_email: "lily@example.com" });
    expect((await res.json()).paypal_email).toBe("lily@example.com");
  });

  it("refuses something that isn't an email", async () => {
    const res = await PUT(req({ paypal_email: "paypal.me/lily" }));
    expect(res.status).toBe(400);
    expect(state.upserts).toHaveLength(0);
  });

  it("clears with null or DELETE", async () => {
    await PUT(req({ paypal_email: null }));
    await DELETE(req());
    expect(state.upserts.map((r: any) => r.paypal_email)).toEqual([null, null]);
  });

  it("GET returns what was saved", async () => {
    state.rows = [{ user_id: "u1", paypal_email: "lily@example.com" }];
    expect((await (await GET(req())).json()).paypal_email).toBe("lily@example.com");
  });
});
