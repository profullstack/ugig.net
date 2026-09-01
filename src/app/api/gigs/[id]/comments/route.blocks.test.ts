import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  usersAreBlocked: vi.fn(),
  sendEmail: vi.fn(),
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
    auth: { admin: { getUserById: async () => ({ data: { user: null } }) } },
  }),
}));

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
 * Enough of a Supabase client to reach the block guards: the gig lookup, the
 * parent-comment lookup, and the insert that must not happen when blocked.
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

describe("gig comments and blocking", () => {
  beforeEach(() => {
    inserted.length = 0;
    mocks.sendEmail.mockReset();
    mocks.usersAreBlocked.mockReset();
    mocks.getAuthContext.mockResolvedValue({
      user: { id: ME },
      supabase: makeSupabase(),
    });
  });

  it("refuses a question on the gig of someone who blocked you", async () => {
    mocks.usersAreBlocked.mockResolvedValue(true);

    const res = await post({ content: "Still hiring?" });

    expect(res.status).toBe(403);
    expect(mocks.usersAreBlocked).toHaveBeenCalledWith(
      expect.anything(),
      ME,
      POSTER
    );
    // The whole point: no comment row, so no notification and no email.
    expect(inserted).toHaveLength(0);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("refuses a reply to a commenter who blocked you", async () => {
    // Not blocked with the gig poster, but blocked with the parent's author.
    mocks.usersAreBlocked.mockImplementation(
      async (_client: unknown, _a: string, b: string) => b === OTHER_COMMENTER
    );

    const res = await post({ content: "no", parent_id: PARENT });

    expect(res.status).toBe(403);
    expect(inserted).toHaveLength(0);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("checks the block before writing anything", async () => {
    mocks.usersAreBlocked.mockResolvedValue(true);

    await post({ content: "Still hiring?" });

    // A comment written first and rejected after would still have notified.
    expect(mocks.usersAreBlocked).toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });
});
