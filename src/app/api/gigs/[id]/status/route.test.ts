import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

const mockFrom = vi.fn();
const mockRpc = vi.fn().mockResolvedValue({ error: null });
const supabaseClient = { from: mockFrom, rpc: mockRpc };

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
  createServiceClient: vi.fn(() => ({
    auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: null }) } },
  })),
}));
vi.mock("@/lib/webhooks/dispatch", () => ({ dispatchWebhookAsync: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), gigFilledEmail: vi.fn(() => ({})) }));

const { mockAdActivation } = vi.hoisted(() => ({ mockAdActivation: vi.fn() }));
vi.mock("@/lib/limits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/limits")>()),
  checkForHireAdActivation: mockAdActivation,
}));

import { PATCH } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";

const GIG_ID = "gig-1";
const params = { params: Promise.resolve({ id: GIG_ID }) };

function req(status: string) {
  return new NextRequest(`http://localhost/api/gigs/${GIG_ID}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

/** Each from("gigs") call: first is the ownership read, second the update. */
function setup(existing: Record<string, unknown>, updates: Record<string, unknown>[]) {
  let gigsCalls = 0;
  mockFrom.mockImplementation((table: string) => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["select", "eq", "in", "update", "single"]) chain[m] = vi.fn(() => chain);
    if (table === "gigs") {
      gigsCalls++;
      if (gigsCalls === 1) {
        chain.single.mockResolvedValue({ data: existing, error: null });
      } else {
        chain.update.mockImplementation((payload: Record<string, unknown>) => {
          updates.push(payload);
          return chain;
        });
        chain.single.mockResolvedValue({ data: { id: GIG_ID }, error: null });
      }
    } else if (table === "subscriptions") {
      chain.single.mockResolvedValue({ data: { plan: "pro" }, error: null });
    } else {
      chain.single.mockResolvedValue({ data: null, error: null });
    }
    return chain;
  });
  vi.mocked(getAuthContext).mockResolvedValue({
    user: { id: "owner-1", authMethod: "session" },
    supabase: supabaseClient,
  } as never);
}

const base = {
  poster_id: "owner-1",
  created_at: "2026-09-01T00:00:00Z",
  title: "Logo design",
  poster: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAdActivation.mockResolvedValue({ ok: true });
});

describe("PATCH /api/gigs/[id]/status - expiry", () => {
  it("resets expires_at to 30 days out when a paused hiring gig is re-activated", async () => {
    const updates: Record<string, unknown>[] = [];
    setup({ ...base, status: "paused", listing_type: "hiring" }, updates);
    const before = Date.now();

    const res = await PATCH(req("active"), params);
    expect(res.status).toBe(200);
    const expires = new Date(updates[0].expires_at as string).getTime();
    expect(Math.abs(expires - before - 30 * 86400_000)).toBeLessThan(5000);
    expect(mockAdActivation).not.toHaveBeenCalled();
  });

  it("resets expires_at to 60 days out for an ad, after the ad checks", async () => {
    const updates: Record<string, unknown>[] = [];
    setup({ ...base, status: "paused", listing_type: "for_hire" }, updates);
    const before = Date.now();

    const res = await PATCH(req("active"), params);
    expect(res.status).toBe(200);
    const expires = new Date(updates[0].expires_at as string).getTime();
    expect(Math.abs(expires - before - 60 * 86400_000)).toBeLessThan(5000);
    expect(mockAdActivation).toHaveBeenCalledWith(supabaseClient, "owner-1", "Logo design", GIG_ID);
  });

  it("does not touch expires_at when pausing", async () => {
    const updates: Record<string, unknown>[] = [];
    setup({ ...base, status: "active", listing_type: "hiring" }, updates);

    const res = await PATCH(req("paused"), params);
    expect(res.status).toBe(200);
    expect(updates[0]).not.toHaveProperty("expires_at");
  });

  it("refuses to activate an ad over the active cap (429) without updating", async () => {
    const updates: Record<string, unknown>[] = [];
    setup({ ...base, status: "draft", listing_type: "for_hire" }, updates);
    mockAdActivation.mockResolvedValue({ ok: false, status: 429, error: "50 active for-hire ads" });

    const res = await PATCH(req("active"), params);
    expect(res.status).toBe(429);
    expect(updates).toHaveLength(0);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("refuses to activate an ad with a duplicate title (409)", async () => {
    const updates: Record<string, unknown>[] = [];
    setup({ ...base, status: "draft", listing_type: "for_hire" }, updates);
    mockAdActivation.mockResolvedValue({ ok: false, status: 409, error: "duplicate" });

    const res = await PATCH(req("active"), params);
    expect(res.status).toBe(409);
    expect(updates).toHaveLength(0);
  });
});
