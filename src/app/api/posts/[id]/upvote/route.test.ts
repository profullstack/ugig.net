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
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true }),
  rateLimitExceeded: vi.fn(),
  getRateLimitIdentifier: () => "t",
}));
vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
  upvoteMilestoneEmail: () => ({ subject: "s", html: "<html><body></body></html>", text: "t" }),
}));
vi.mock("@/lib/notification-settings", () => ({
  isEmailNotificationEnabled: mocks.emailEnabled,
}));
vi.mock("@/lib/reputation-hooks", () => ({ getUserDid: async () => null, onUpvoted: vi.fn() }));
vi.mock("@/lib/activity", () => ({ logActivity: async () => {} }));

import { POST } from "./route";

const AUTHOR = "author-1";
const VOTER = "voter-1";

/** posts is read twice: before (4 upvotes) and after (5: crosses the 5 milestone). */
function makeSupabase() {
  let postReads = 0;
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "insert", "update", "delete"]) chain[m] = () => chain;
      chain.single = () => {
        if (table === "posts") {
          postReads++;
          return Promise.resolve(
            postReads === 1
              ? { data: { id: "p1", upvotes: 4, content: "hello", author_id: AUTHOR, author: { full_name: "Au", username: "au" } }, error: null }
              : { data: { upvotes: 5, downvotes: 0, score: 5 }, error: null }
          );
        }
        return Promise.resolve({ data: null, error: null });
      };
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null });
      return chain;
    },
  };
}

const request = () => new NextRequest("http://localhost/api/posts/p1/upvote", { method: "POST" });
const params = { params: Promise.resolve({ id: "p1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendEmail.mockResolvedValue({ success: true });
  mocks.emailEnabled.mockResolvedValue(true);
  mocks.getAuthContext.mockResolvedValue({ user: { id: VOTER }, supabase: makeSupabase() });
});

describe("POST /api/posts/[id]/upvote milestone email", () => {
  it("emails the author with an email_upvote_milestone unsubscribe", async () => {
    const res = await POST(request(), params);
    expect(res.status).toBe(200);
    expect(mocks.emailEnabled).toHaveBeenCalledWith(svc, AUTHOR, "email_upvote_milestone");
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: `${AUTHOR}@example.test`,
        unsubscribe: { userId: AUTHOR, setting: "email_upvote_milestone" },
      })
    );
  });

  it("sends nothing when email_upvote_milestone is off", async () => {
    mocks.emailEnabled.mockResolvedValue(false);
    const res = await POST(request(), params);
    expect(res.status).toBe(200);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
