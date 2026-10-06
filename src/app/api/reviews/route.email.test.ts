import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  sendEmail: vi.fn(),
  emailEnabled: vi.fn(),
}));

const svc = {
  auth: {
    admin: {
      getUserById: async (id: string) => ({ data: { user: { id, email: `${id}@example.test` } } }),
    },
  },
};

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: mocks.getAuthContext,
  createServiceClient: () => svc,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
  reviewReceivedEmail: () => ({ subject: "s", html: "<html><body></body></html>", text: "t" }),
}));
vi.mock("@/lib/notification-settings", () => ({
  isEmailNotificationEnabled: mocks.emailEnabled,
}));
vi.mock("@/lib/blocks", () => ({
  usersAreBlocked: async () => false,
  getBlockedUserIds: async () => [],
  excludeBlocked: (q: unknown) => q,
}));
vi.mock("@/lib/webhooks/dispatch", () => ({ dispatchWebhookAsync: vi.fn() }));
vi.mock("@/lib/reputation-hooks", () => ({ getUserDid: async () => null, onReviewCreated: vi.fn() }));
vi.mock("@/lib/activity", () => ({ logActivity: async () => {} }));

import { POST } from "./route";

const POSTER = "00000000-0000-4000-a000-000000000001";
const WORKER = "00000000-0000-4000-a000-000000000002";
const GIG = "00000000-0000-4000-a000-0000000000ff";

function makeSupabase() {
  let reviewSingles = 0;
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "limit", "insert"]) chain[m] = () => chain;
      chain.maybeSingle = () => Promise.resolve({ data: { id: "app-1" }, error: null });
      chain.single = () => {
        if (table === "gigs")
          return Promise.resolve({ data: { id: GIG, title: "Logo", poster_id: POSTER, status: "filled" }, error: null });
        if (table === "reviews") {
          reviewSingles++;
          return Promise.resolve(
            reviewSingles === 1
              ? { data: null, error: null }
              : {
                  data: {
                    id: "rev-1",
                    reviewer: { id: POSTER, username: "pat", full_name: "Pat" },
                    reviewee: { id: WORKER, username: "wren", full_name: "Wren" },
                  },
                  error: null,
                }
          );
        }
        return Promise.resolve({ data: null, error: null });
      };
      return chain;
    },
  };
}

const request = () =>
  new NextRequest("http://localhost/api/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gig_id: GIG, reviewee_id: WORKER, rating: 5, comment: "Great" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendEmail.mockResolvedValue({ success: true });
  mocks.emailEnabled.mockResolvedValue(true);
  mocks.getAuthContext.mockResolvedValue({ user: { id: POSTER }, supabase: makeSupabase() });
});

describe("POST /api/reviews email", () => {
  it("emails the reviewee with an email_review_received unsubscribe", async () => {
    const res = await POST(request());
    expect(res.status).toBe(201);
    expect(mocks.emailEnabled).toHaveBeenCalledWith(svc, WORKER, "email_review_received");
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: `${WORKER}@example.test`,
        unsubscribe: { userId: WORKER, setting: "email_review_received" },
      })
    );
  });

  it("sends nothing when email_review_received is off", async () => {
    mocks.emailEnabled.mockResolvedValue(false);
    const res = await POST(request());
    expect(res.status).toBe(201);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
