import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/github-app", () => ({
  updateIssueComment: vi.fn().mockResolvedValue(true),
}));

import { DELETE, PATCH } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";
import { updateIssueComment } from "@/lib/github-app";

const mockGetAuthContext = vi.mocked(getAuthContext);
const mockUpdateIssueComment = vi.mocked(updateIssueComment);

const BOUNTY: {
  id: string;
  creator_id: string;
  title: string;
  status: string;
  payout_usd: number;
  payment_coin: string | null;
  github_issue_url: string | null;
  github_comment_id: number | null;
} = {
  id: "bounty-1",
  creator_id: "creator-1",
  title: "Write the docs",
  status: "open",
  payout_usd: 25,
  payment_coin: "SOL",
  github_issue_url: "https://github.com/acme/widgets/issues/7",
  github_comment_id: 4242,
};

function makeParams() {
  return { params: Promise.resolve({ id: "bounty-1" }) };
}

function deleteRequest() {
  return new NextRequest("http://localhost/api/bounties/bounty-1", { method: "DELETE" });
}

function patchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/bounties/bounty-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * A supabase stub keyed by table. `bounties` answers the ownership lookup
 * (and the update, for PATCH); `bounty_submissions` answers the payout scan.
 */
function makeSupabase(opts: {
  bounty?: typeof BOUNTY | null;
  submissions?: Array<{ status: string; payout_status: string }>;
  deleteError?: { message: string } | null;
}) {
  const bounty = opts.bounty === undefined ? BOUNTY : opts.bounty;
  const deleteEq = vi.fn().mockResolvedValue({ error: opts.deleteError ?? null });
  const bountiesChain = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: bounty, error: null }),
    delete: vi.fn(() => ({ eq: deleteEq })),
  };
  const submissionsChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: opts.submissions ?? [], error: null }),
  };
  const from = vi.fn((table: string) =>
    table === "bounty_submissions" ? submissionsChain : bountiesChain
  );
  return { client: { from }, bountiesChain, submissionsChain, deleteEq };
}

describe("DELETE /api/bounties/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await DELETE(deleteRequest(), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 404 when the bounty does not exist", async () => {
    const { client } = makeSupabase({ bounty: null });
    mockGetAuthContext.mockResolvedValue({ user: { id: "creator-1" }, supabase: client } as any);
    const res = await DELETE(deleteRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 403 for anyone but the creator", async () => {
    const { client, deleteEq } = makeSupabase({});
    mockGetAuthContext.mockResolvedValue({ user: { id: "someone-else" }, supabase: client } as any);
    const res = await DELETE(deleteRequest(), makeParams());
    expect(res.status).toBe(403);
    expect(deleteEq).not.toHaveBeenCalled();
  });

  it("refuses with 409 once a submission has been paid, and points at archiving", async () => {
    const { client, deleteEq } = makeSupabase({
      submissions: [
        { status: "approved", payout_status: "paid" },
        { status: "pending", payout_status: "unpaid" },
      ],
    });
    mockGetAuthContext.mockResolvedValue({ user: { id: "creator-1" }, supabase: client } as any);
    const res = await DELETE(deleteRequest(), makeParams());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.archive_instead).toBe(true);
    expect(body.error).toMatch(/1 paid or invoiced submission/);
    expect(body.error).toMatch(/archive it instead/i);
    expect(deleteEq).not.toHaveBeenCalled();
  });

  it("refuses with 409 when an approved submission is still owed", async () => {
    const { client, deleteEq } = makeSupabase({
      submissions: [{ status: "approved", payout_status: "unpaid" }],
    });
    mockGetAuthContext.mockResolvedValue({ user: { id: "creator-1" }, supabase: client } as any);
    const res = await DELETE(deleteRequest(), makeParams());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/1 approved submission still unpaid/);
    expect(deleteEq).not.toHaveBeenCalled();
  });

  it("deletes a bounty with only pending or rejected submissions and withdraws the issue comment", async () => {
    const { client, deleteEq } = makeSupabase({
      submissions: [
        { status: "pending", payout_status: "unpaid" },
        { status: "rejected", payout_status: "unpaid" },
      ],
    });
    mockGetAuthContext.mockResolvedValue({ user: { id: "creator-1" }, supabase: client } as any);
    const res = await DELETE(deleteRequest(), makeParams());
    expect(res.status).toBe(200);
    expect(deleteEq).toHaveBeenCalledWith("id", "bounty-1");
    expect(mockUpdateIssueComment).toHaveBeenCalledWith(
      "acme",
      "widgets",
      4242,
      expect.stringContaining("Bounty withdrawn")
    );
  });

  it("skips the GitHub comment when the bounty funds no issue", async () => {
    const { client } = makeSupabase({
      bounty: { ...BOUNTY, github_issue_url: null, github_comment_id: null },
    });
    mockGetAuthContext.mockResolvedValue({ user: { id: "creator-1" }, supabase: client } as any);
    const res = await DELETE(deleteRequest(), makeParams());
    expect(res.status).toBe(200);
    expect(mockUpdateIssueComment).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/bounties/[id] status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts archived and withdraws the issue comment", async () => {
    const { client, bountiesChain } = makeSupabase({});
    bountiesChain.single
      .mockResolvedValueOnce({ data: BOUNTY, error: null })
      .mockResolvedValueOnce({ data: { ...BOUNTY, status: "archived" }, error: null });
    mockGetAuthContext.mockResolvedValue({ user: { id: "creator-1" }, supabase: client } as any);
    const res = await PATCH(patchRequest({ status: "archived" }), makeParams());
    expect(res.status).toBe(200);
    expect(bountiesChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "archived" })
    );
    expect(mockUpdateIssueComment).toHaveBeenCalledWith(
      "acme",
      "widgets",
      4242,
      expect.stringContaining("Bounty withdrawn")
    );
  });

  it("restores the posted comment when an archived bounty is reopened", async () => {
    const { client, bountiesChain } = makeSupabase({ bounty: { ...BOUNTY, status: "archived" } });
    bountiesChain.single
      .mockResolvedValueOnce({ data: { ...BOUNTY, status: "archived" }, error: null })
      .mockResolvedValueOnce({ data: { ...BOUNTY, status: "open" }, error: null });
    mockGetAuthContext.mockResolvedValue({ user: { id: "creator-1" }, supabase: client } as any);
    const res = await PATCH(patchRequest({ status: "open" }), makeParams());
    expect(res.status).toBe(200);
    expect(mockUpdateIssueComment).toHaveBeenCalledWith(
      "acme",
      "widgets",
      4242,
      expect.stringContaining("Bounty posted")
    );
  });

  it("leaves the comment alone for a pause", async () => {
    const { client, bountiesChain } = makeSupabase({});
    bountiesChain.single
      .mockResolvedValueOnce({ data: BOUNTY, error: null })
      .mockResolvedValueOnce({ data: { ...BOUNTY, status: "paused" }, error: null });
    mockGetAuthContext.mockResolvedValue({ user: { id: "creator-1" }, supabase: client } as any);
    const res = await PATCH(patchRequest({ status: "paused" }), makeParams());
    expect(res.status).toBe(200);
    expect(mockUpdateIssueComment).not.toHaveBeenCalled();
  });

  it("rejects an unknown status", async () => {
    const { client } = makeSupabase({});
    mockGetAuthContext.mockResolvedValue({ user: { id: "creator-1" }, supabase: client } as any);
    const res = await PATCH(patchRequest({ status: "deleted" }), makeParams());
    expect(res.status).toBe(400);
  });
});
