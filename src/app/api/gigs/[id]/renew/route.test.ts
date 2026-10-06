import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockFrom = vi.fn();
const supabaseClient = { from: mockFrom };

vi.mock("@/lib/auth/get-user", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/lib/webhooks/dispatch", () => ({ dispatchWebhookAsync: vi.fn() }));

const { mockAdActivation } = vi.hoisted(() => ({ mockAdActivation: vi.fn() }));
vi.mock("@/lib/limits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/limits")>()),
  checkForHireAdActivation: mockAdActivation,
}));

import { POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";
import { dispatchWebhookAsync } from "@/lib/webhooks/dispatch";

const GIG_ID = "gig-1";
const params = { params: Promise.resolve({ id: GIG_ID }) };
const req = () => new NextRequest(`http://localhost/api/gigs/${GIG_ID}/renew`, { method: "POST" });

function setup(existing: Record<string, unknown> | null, updates: Record<string, unknown>[], userId = "owner-1") {
  let calls = 0;
  mockFrom.mockImplementation(() => {
    calls++;
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["select", "eq", "update", "single"]) chain[m] = vi.fn(() => chain);
    if (calls === 1) {
      chain.single.mockResolvedValue({ data: existing, error: null });
    } else {
      chain.update.mockImplementation((payload: Record<string, unknown>) => {
        updates.push(payload);
        return chain;
      });
      chain.single.mockResolvedValue({ data: { id: GIG_ID, status: "active" }, error: null });
    }
    return chain;
  });
  vi.mocked(getAuthContext).mockResolvedValue({
    user: { id: userId, authMethod: "session" },
    supabase: supabaseClient,
  } as never);
}

const pausedHiring = { poster_id: "owner-1", status: "paused", listing_type: "hiring", title: "Build a CLI" };

beforeEach(() => {
  vi.clearAllMocks();
  mockAdActivation.mockResolvedValue({ ok: true });
});

describe("POST /api/gigs/[id]/renew", () => {
  it("returns 401 when not signed in", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    expect((await POST(req(), params)).status).toBe(401);
  });

  it("returns 404 for a missing gig", async () => {
    setup(null, []);
    expect((await POST(req(), params)).status).toBe(404);
  });

  it("returns 403 for someone else's gig", async () => {
    const updates: Record<string, unknown>[] = [];
    setup(pausedHiring, updates, "someone-else");
    expect((await POST(req(), params)).status).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it.each(["closed", "filled", "draft"])("refuses to renew a %s gig (409)", async (status) => {
    const updates: Record<string, unknown>[] = [];
    setup({ ...pausedHiring, status }, updates);
    expect((await POST(req(), params)).status).toBe(409);
    expect(updates).toHaveLength(0);
  });

  it("re-activates an expired hiring gig for 30 days", async () => {
    const updates: Record<string, unknown>[] = [];
    setup(pausedHiring, updates);
    const before = Date.now();

    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    expect((await res.json()).renewed_days).toBe(30);
    expect(updates[0].status).toBe("active");
    const expires = new Date(updates[0].expires_at as string).getTime();
    expect(Math.abs(expires - before - 30 * 86400_000)).toBeLessThan(5000);
    expect(mockAdActivation).not.toHaveBeenCalled();
    expect(dispatchWebhookAsync).toHaveBeenCalledWith("owner-1", "gig.update", {
      gig_id: GIG_ID,
      old_status: "paused",
      new_status: "active",
    });
  });

  it("renews a paused ad for 60 days after the ad checks", async () => {
    const updates: Record<string, unknown>[] = [];
    setup({ ...pausedHiring, listing_type: "for_hire" }, updates);
    const before = Date.now();

    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    expect((await res.json()).renewed_days).toBe(60);
    const expires = new Date(updates[0].expires_at as string).getTime();
    expect(Math.abs(expires - before - 60 * 86400_000)).toBeLessThan(5000);
    expect(mockAdActivation).toHaveBeenCalledWith(supabaseClient, "owner-1", "Build a CLI", GIG_ID);
  });

  it("refuses to renew a paused ad over the active cap", async () => {
    const updates: Record<string, unknown>[] = [];
    setup({ ...pausedHiring, listing_type: "for_hire" }, updates);
    mockAdActivation.mockResolvedValue({ ok: false, status: 429, error: "50 active" });

    expect((await POST(req(), params)).status).toBe(429);
    expect(updates).toHaveLength(0);
  });

  it("extends an active gig early without re-running the ad checks or a webhook", async () => {
    const updates: Record<string, unknown>[] = [];
    setup({ ...pausedHiring, status: "active", listing_type: "for_hire" }, updates);

    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    expect(updates[0].status).toBe("active");
    expect(mockAdActivation).not.toHaveBeenCalled();
    expect(dispatchWebhookAsync).not.toHaveBeenCalled();
  });
  it("reactivates an archived gig for its listing window", async () => {
    const updates: Record<string, unknown>[] = [];
    setup({ ...pausedHiring, status: "archived", archived_from_status: "active" }, updates);

    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    expect((await res.json()).renewed_days).toBe(30);
    expect(updates[0].status).toBe("active");
    expect(updates[0].expires_at).toBeTruthy();
    expect(dispatchWebhookAsync).toHaveBeenCalledWith("owner-1", "gig.update", {
      gig_id: GIG_ID,
      old_status: "archived",
      new_status: "active",
    });
  });

  it("runs the ad checks before reactivating an archived ad", async () => {
    const updates: Record<string, unknown>[] = [];
    setup({ ...pausedHiring, status: "archived", archived_from_status: "active", listing_type: "for_hire" }, updates);
    mockAdActivation.mockResolvedValue({ ok: false, status: 429, error: "50 active" });

    expect((await POST(req(), params)).status).toBe(429);
    expect(updates).toHaveLength(0);
  });

  it("puts an archived draft back as a draft, not live", async () => {
    const updates: Record<string, unknown>[] = [];
    setup({ ...pausedHiring, status: "archived", archived_from_status: "draft" }, updates);

    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    expect((await res.json()).restored_to).toBe("draft");
    expect(updates).toEqual([expect.objectContaining({ status: "draft" })]);
    expect(updates[0].expires_at).toBeUndefined();
    expect(dispatchWebhookAsync).not.toHaveBeenCalled();
  });
});
