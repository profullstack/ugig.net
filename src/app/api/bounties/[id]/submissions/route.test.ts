import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockFrom = vi.fn();

const supabaseClient = {
  from: mockFrom,
};

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

import { GET } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";

const mockGetAuthContext = vi.mocked(getAuthContext);

function makeRequest() {
  return new NextRequest("http://localhost/api/bounties/bounty-1/submissions", {
    method: "GET",
  });
}

function makeParams() {
  return { params: Promise.resolve({ id: "bounty-1" }) };
}

function makeBountyQuery(creatorId: string) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { id: "bounty-1", creator_id: creatorId },
    }),
  };
}

function makeSubmissionsQuery() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
}

describe("GET /api/bounties/[id]/submissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "api_key" },
      supabase: supabaseClient,
    } as never);
  });

  it("filters non-creator API key requests to the caller's submissions", async () => {
    const bountyQuery = makeBountyQuery("creator-1");
    const submissionsQuery = makeSubmissionsQuery();
    mockFrom.mockImplementation((table: string) =>
      table === "bounties" ? bountyQuery : submissionsQuery
    );

    const response = await GET(makeRequest(), makeParams());

    expect(response.status).toBe(200);
    expect(submissionsQuery.eq).toHaveBeenCalledWith("bounty_id", "bounty-1");
    expect(submissionsQuery.eq).toHaveBeenCalledWith("submitter_id", "user-1");
  });

  it("allows bounty creators to list all submissions for their bounty", async () => {
    const bountyQuery = makeBountyQuery("user-1");
    const submissionsQuery = makeSubmissionsQuery();
    mockFrom.mockImplementation((table: string) =>
      table === "bounties" ? bountyQuery : submissionsQuery
    );

    const response = await GET(makeRequest(), makeParams());

    expect(response.status).toBe(200);
    expect(submissionsQuery.eq).toHaveBeenCalledWith("bounty_id", "bounty-1");
    expect(submissionsQuery.eq).not.toHaveBeenCalledWith("submitter_id", "user-1");
  });
});
