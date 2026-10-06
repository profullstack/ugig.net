import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  usersAreBlocked: vi.fn(),
  sendEmail: vi.fn(),
  emailEnabled: vi.fn(),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: mocks.getAuthContext,
}));

vi.mock("@/lib/blocks", () => ({
  usersAreBlocked: mocks.usersAreBlocked,
}));

vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
  newGigCommentEmail: () => ({ subject: "s", html: "h", text: "t" }),
  newGigCommentReplyEmail: () => ({ subject: "s", html: "h", text: "t" }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { id, email: `${id}@example.test` } } }) } },
  }),
}));

vi.mock("@/lib/notification-settings", () => ({
  isEmailNotificationEnabled: mocks.emailEnabled,
}));

vi.mock("@/lib/reputation-hooks", () => ({
  getUserDid: async () => null,
  onCommentCreated: () => {},
}));

vi.mock("@/lib/activity", () => ({ logActivity: async () => {} }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => makeSupabase(),
}));

import { POST } from "./route";

const ME = "00000000-0000-4000-a000-00000000000a";
const POSTER = "00000000-0000-4000-a000-00000000000b";
const OTHER_COMMENTER = "00000000-0000-4000-a000-00000000000c";
const GIG = "00000000-0000-4000-a000-0000000000ff";
const PARENT = "00000000-0000-4000-a000-0000000000fe";

const inserted: Record<string, unknown>[] = [];

/**
 * Enough of a Supabase client for the comment paths that send email.
 */
function makeSupabase({ parentAuthorId = OTHER_COMMENTER } = {}) {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.order = () => chain;
      chain.insert = (row: Record<string, unknown>) => {
        inserted.push({ table, ...row });
        return chain;
      };
      chain.single = () => {
        if (table === "gigs") {
          return Promise.resolve({
            data: {
              id: GIG,
              title: "A gig",
              poster_id: POSTER,
              poster: { id: POSTER, username: "poster", full_name: null, avatar_url: null },
            },
            error: null,
          });
        }
        if (table === "gig_comments") {
          return Promise.resolve({
            data: {
              id: PARENT,
              gig_id: GIG,
              parent_id: null,
              author_id: parentAuthorId,
              content: "hi",
              author: { id: parentAuthorId, username: "them", full_name: null, avatar_url: null },
            },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      };
      chain.then = (resolve: (value: unknown) => unknown) =>
        resolve({ data: null, error: null });
      return chain;
    },
  };
}

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/gigs/x/comments", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
    { params: Promise.resolve({ id: GIG }) }
  );
}

describe("gig comment emails honour notification settings", () => {
  beforeEach(() => {
    inserted.length = 0;
    mocks.sendEmail.mockReset();
    mocks.sendEmail.mockResolvedValue({ success: true });
    mocks.emailEnabled.mockReset();
    mocks.emailEnabled.mockResolvedValue(true);
    mocks.usersAreBlocked.mockResolvedValue(false);
    mocks.getAuthContext.mockResolvedValue({
      user: { id: ME },
      supabase: makeSupabase(),
    });
  });

  it("emails the gig poster about a new question, with an email_new_comment unsubscribe", async () => {
    const res = await post({ content: "Still hiring?" });

    expect(res.status).toBe(201);
    expect(mocks.emailEnabled).toHaveBeenCalledWith(expect.anything(), POSTER, "email_new_comment");
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: `${POSTER}@example.test`,
        unsubscribe: { userId: POSTER, setting: "email_new_comment" },
      })
    );
  });

  it("emails the parent commenter about a reply, with an unsubscribe", async () => {
    const res = await post({ content: "Agreed", parent_id: PARENT });

    expect(res.status).toBe(201);
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: `${OTHER_COMMENTER}@example.test`,
        unsubscribe: { userId: OTHER_COMMENTER, setting: "email_new_comment" },
      })
    );
  });

  it("sends nothing to someone who turned email_new_comment off", async () => {
    mocks.emailEnabled.mockResolvedValue(false);

    const res = await post({ content: "Still hiring?" });

    expect(res.status).toBe(201);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
