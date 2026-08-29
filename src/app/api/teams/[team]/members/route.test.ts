import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/teams-access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/teams-access")>("@/lib/teams-access");
  return { ...actual, getTeamAccess: vi.fn() };
});

import { POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";
import { getTeamAccess } from "@/lib/teams-access";

const TEAM = {
  id: "11111111-1111-4111-8111-111111111111",
  owner_id: "22222222-2222-4222-8222-222222222222",
  name: "Core",
  slug: "core",
  description: null,
  billable_rate_usd: 150,
  created_at: "2026-08-29T00:00:00Z",
  updated_at: "2026-08-29T00:00:00Z",
};

const params = Promise.resolve({ team: "core" });

function makeReq(body: unknown) {
  return {
    json: async () => body,
    nextUrl: new URL("http://localhost/api/teams/core/members"),
  } as any;
}

/** Minimal PostgREST stub: one canned answer per table. */
function makeClient(answers: Record<string, any>) {
  const from = vi.fn((table: string) => {
    const answer = answers[table];
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      ilike: vi.fn(() => builder),
      insert: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => answer ?? { data: null, error: null }),
      single: vi.fn(async () => answer ?? { data: null, error: null }),
    };
    return builder;
  });
  return { from };
}

function authAs(userId: string, client: any) {
  (getAuthContext as any).mockResolvedValue({
    user: { id: userId, authMethod: "session" },
    supabase: client,
  });
}

describe("POST /api/teams/[team]/members", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401s without a session", async () => {
    (getAuthContext as any).mockResolvedValue(null);
    const res = await POST(makeReq({ username: "preshy" }), { params });
    expect(res.status).toBe(401);
  });

  it("404s when the team is not visible to the caller", async () => {
    authAs("someone", makeClient({}));
    (getTeamAccess as any).mockResolvedValue(null);

    const res = await POST(makeReq({ username: "preshy" }), { params });
    expect(res.status).toBe(404);
  });

  it("403s for a plain member", async () => {
    authAs("member-id", makeClient({}));
    (getTeamAccess as any).mockResolvedValue({
      team: TEAM,
      role: "member",
      isOwner: false,
      canManage: false,
    });

    const res = await POST(makeReq({ username: "preshy" }), { params });
    expect(res.status).toBe(403);
  });

  it("refuses to add a second owner", async () => {
    authAs(TEAM.owner_id, makeClient({}));
    (getTeamAccess as any).mockResolvedValue({
      team: TEAM,
      role: "owner",
      isOwner: true,
      canManage: true,
    });

    const res = await POST(makeReq({ username: "preshy", role: "owner" }), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/one owner/i);
  });

  it("404s when the username does not exist", async () => {
    authAs(TEAM.owner_id, makeClient({ profiles: { data: null, error: null } }));
    (getTeamAccess as any).mockResolvedValue({
      team: TEAM,
      role: "owner",
      isOwner: true,
      canManage: true,
    });

    const res = await POST(makeReq({ username: "nobody" }), { params });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/no user named nobody/i);
  });

  it("adds a known user as an active member with a rate override", async () => {
    const inserted = {
      id: "33333333-3333-4333-8333-333333333333",
      team_id: TEAM.id,
      user_id: "44444444-4444-4444-8444-444444444444",
      role: "member",
      billable_rate_usd: 90,
      status: "active",
    };
    const client = makeClient({
      profiles: { data: { id: inserted.user_id }, error: null },
      team_members: { data: inserted, error: null },
    });
    authAs(TEAM.owner_id, client);
    (getTeamAccess as any).mockResolvedValue({
      team: TEAM,
      role: "owner",
      isOwner: true,
      canManage: true,
    });

    const res = await POST(makeReq({ username: "preshy", billable_rate_usd: 90 }), { params });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.billable_rate_usd).toBe(90);
    expect(body.data.status).toBe("active");
  });

  it("reports a duplicate as a 409 rather than a raw database error", async () => {
    const client = makeClient({
      profiles: { data: { id: "44444444-4444-4444-8444-444444444444" }, error: null },
      team_members: { data: null, error: { code: "23505", message: "duplicate key" } },
    });
    authAs(TEAM.owner_id, client);
    (getTeamAccess as any).mockResolvedValue({
      team: TEAM,
      role: "owner",
      isOwner: true,
      canManage: true,
    });

    const res = await POST(makeReq({ username: "preshy" }), { params });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already on the team/i);
  });

  it("stores an email invite as a pending row", async () => {
    let insertedRow: any = null;
    const from = vi.fn((table: string) => {
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        ilike: vi.fn(() => builder),
        insert: vi.fn((row: any) => {
          insertedRow = row;
          return builder;
        }),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        single: vi.fn(async () => ({ data: { id: "x", ...insertedRow }, error: null })),
      };
      expect(["profiles", "team_members"]).toContain(table);
      return builder;
    });
    authAs(TEAM.owner_id, { from });
    (getTeamAccess as any).mockResolvedValue({
      team: TEAM,
      role: "owner",
      isOwner: true,
      canManage: true,
    });

    const res = await POST(makeReq({ email: "Preshy@Example.com" }), { params });
    expect(res.status).toBe(201);
    expect(insertedRow.status).toBe("invited");
    expect(insertedRow.invited_email).toBe("preshy@example.com");
    expect(insertedRow.user_id).toBeNull();
  });
});
