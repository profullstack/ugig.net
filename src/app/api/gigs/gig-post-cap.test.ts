import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createFakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { FREE_MONTHLY_GIG_POSTS } from "@/lib/plans";

// The free 10 posts/month cap, replayed end to end against an in-memory DB:
// every way a gig becomes active (POST active, PATCH /status, PUT with status)
// is checked against the same counter and increments it once.

let db: FakeSupabase;

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(async () => ({ user: { id: "user-1" }, supabase: db })),
  createServiceClient: vi.fn(() => db),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => db) }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  rateLimitExceeded: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => "test-user"),
}));
vi.mock("@/lib/reputation-hooks", () => ({
  getUserDid: vi.fn().mockResolvedValue(null),
  onGigPosted: vi.fn(),
}));
vi.mock("@/lib/activity", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/webhooks/dispatch", () => ({ dispatchWebhookAsync: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), gigFilledEmail: vi.fn() }));

import { POST } from "./route";
import { PUT } from "./[id]/route";
import { PATCH } from "./[id]/status/route";

const gigBody = (overrides: Record<string, unknown> = {}) => ({
  title: "Test Gig Title Here",
  description:
    "A test gig description that is long enough to pass the fifty character validation minimum requirement for gig descriptions.",
  category: "development",
  budget_type: "fixed",
  budget_min: 100,
  budget_max: 500,
  location_type: "remote",
  skills_required: ["typescript"],
  ai_tools_preferred: [],
  status: "active",
  ...overrides,
});

function req(method: string, url: string, body: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const createGig = (overrides: Record<string, unknown> = {}) =>
  POST(req("POST", "http://localhost/api/gigs", gigBody(overrides)));
const patchStatus = (id: string, status: string) =>
  PATCH(req("PATCH", `http://localhost/api/gigs/${id}/status`, { status }), {
    params: Promise.resolve({ id }),
  });
const putGig = (id: string, body: Record<string, unknown>) =>
  PUT(req("PUT", `http://localhost/api/gigs/${id}`, body), { params: Promise.resolve({ id }) });

function postsCount() {
  return db.tables.gig_usage.find((r) => r.user_id === "user-1")?.posts_count ?? 0;
}

function seed(plan: "free" | "pro" | "lifetime" = "free") {
  db = createFakeSupabase({
    subscriptions: [{ user_id: "user-1", plan, status: "active" }],
    gig_usage: [],
    gigs: [],
  });
  // increment_gig_usage as deployed today (UPDATE only)
  db.rpcs.increment_gig_usage = ({ p_user_id, p_month, p_year }) => {
    for (const r of db.tables.gig_usage) {
      if (r.user_id === p_user_id && r.month === p_month && r.year === p_year) r.posts_count += 1;
    }
  };
}

beforeEach(() => seed());

describe("free gig post cap", () => {
  it(`allows ${FREE_MONTHLY_GIG_POSTS} active posts, then refuses the next one`, async () => {
    for (let i = 0; i < FREE_MONTHLY_GIG_POSTS; i++) {
      const res = await createGig();
      expect(res.status).toBe(201);
    }
    expect(postsCount()).toBe(FREE_MONTHLY_GIG_POSTS);

    const res = await createGig();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/monthly limit of 10/);
    expect(db.tables.gigs).toHaveLength(FREE_MONTHLY_GIG_POSTS);
  });

  it("counts for-hire ads the same as hiring gigs", async () => {
    await createGig({ listing_type: "for_hire" });
    await createGig({ listing_type: "hiring" });
    expect(postsCount()).toBe(2);
  });

  it("drafts are free; publishing a draft counts and is capped", async () => {
    const draftRes = await createGig({ status: "draft" });
    expect(draftRes.status).toBe(201);
    expect(postsCount()).toBe(0);
    const draftId = (await draftRes.json()).gig.id;

    db.tables.gig_usage = [
      { user_id: "user-1", month: new Date().getMonth() + 1, year: new Date().getFullYear(), posts_count: FREE_MONTHLY_GIG_POSTS },
    ];
    const blocked = await patchStatus(draftId, "active");
    expect(blocked.status).toBe(403);
    expect(db.tables.gigs.find((g) => g.id === draftId)?.status).toBe("draft");

    db.tables.gig_usage[0].posts_count = FREE_MONTHLY_GIG_POSTS - 1;
    const ok = await patchStatus(draftId, "active");
    expect(ok.status).toBe(200);
    expect(postsCount()).toBe(FREE_MONTHLY_GIG_POSTS);
  });

  it("PATCH /status between non-active states does not count", async () => {
    const id = (await (await createGig()).json()).gig.id;
    expect(postsCount()).toBe(1);
    await patchStatus(id, "paused");
    expect(postsCount()).toBe(1);
  });

  it("PUT that activates a draft is capped and counted", async () => {
    const id = (await (await createGig({ status: "draft" })).json()).gig.id;
    db.tables.gig_usage = [
      { user_id: "user-1", month: new Date().getMonth() + 1, year: new Date().getFullYear(), posts_count: FREE_MONTHLY_GIG_POSTS },
    ];
    const blocked = await putGig(id, { status: "active" });
    expect(blocked.status).toBe(403);

    db.tables.gig_usage[0].posts_count = 3;
    const ok = await putGig(id, { status: "active" });
    expect(ok.status).toBe(200);
    expect(postsCount()).toBe(4);
  });

  it("PUT that edits an already active gig does not count", async () => {
    const id = (await (await createGig()).json()).gig.id;
    await putGig(id, { title: "A different title here", status: "active" });
    expect(postsCount()).toBe(1);
  });

  it.each(["pro", "lifetime"] as const)("%s accounts are not capped", async (plan) => {
    seed(plan);
    db.tables.gig_usage = [
      { user_id: "user-1", month: new Date().getMonth() + 1, year: new Date().getFullYear(), posts_count: 50 },
    ];
    expect((await createGig()).status).toBe(201);
  });
});
