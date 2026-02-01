import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

// ── Mocks ──────────────────────────────────────────────────────────

const mockFrom = vi.fn();
const mockGetUser = vi.fn();

const supabaseClient = {
  from: mockFrom,
  auth: {
    getUser: mockGetUser,
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseClient)),
}));

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(searchParams?: Record<string, string>) {
  let url = "http://localhost/api/users/testuser/endorsements";
  if (searchParams) {
    const params = new URLSearchParams(searchParams);
    url += `?${params.toString()}`;
  }
  return new NextRequest(url, { method: "GET" });
}

const routeParams = { params: Promise.resolve({ username: "testuser" }) };

function chainResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ["select", "eq", "single", "order"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single.mockResolvedValue(result);
  // For non-single queries (endorsements list), mock the order to resolve
  chain.order.mockResolvedValue(result);
  return chain;
}

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: null } });
});

// ════════════════════════════════════════════════════════════════════
//  GET /api/users/:username/endorsements
// ════════════════════════════════════════════════════════════════════

describe("GET /api/users/:username/endorsements", () => {
  it("returns 404 when user not found", async () => {
    const profileChain = chainResult({ data: null, error: null });
    mockFrom.mockReturnValue(profileChain);

    const res = await GET(makeRequest(), routeParams);
    expect(res.status).toBe(404);
  });

  it("returns grouped endorsements", async () => {
    const profileChain = chainResult({
      data: { id: "user-456", skills: ["React", "Node.js"] },
      error: null,
    });

    const endorsements = [
      {
        id: "e1",
        endorser_id: "u1",
        endorsed_id: "user-456",
        skill: "React",
        comment: "Great!",
        created_at: "2025-01-01T00:00:00Z",
        endorser: { id: "u1", username: "alice", full_name: "Alice", avatar_url: null },
      },
      {
        id: "e2",
        endorser_id: "u2",
        endorsed_id: "user-456",
        skill: "React",
        comment: null,
        created_at: "2025-01-02T00:00:00Z",
        endorser: { id: "u2", username: "bob", full_name: "Bob", avatar_url: null },
      },
      {
        id: "e3",
        endorser_id: "u1",
        endorsed_id: "user-456",
        skill: "Node.js",
        comment: null,
        created_at: "2025-01-01T00:00:00Z",
        endorser: { id: "u1", username: "alice", full_name: "Alice", avatar_url: null },
      },
    ];

    const endorsementChain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["select", "eq", "order"]) {
      endorsementChain[m] = vi.fn().mockReturnValue(endorsementChain);
    }
    endorsementChain.order.mockResolvedValue({
      data: endorsements,
      error: null,
    });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? profileChain : endorsementChain;
    });

    const res = await GET(makeRequest(), routeParams);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.total_endorsements).toBe(3);
    expect(json.data).toHaveLength(2);
    // React should be first (2 endorsements)
    expect(json.data[0].skill).toBe("React");
    expect(json.data[0].count).toBe(2);
    expect(json.data[1].skill).toBe("Node.js");
    expect(json.data[1].count).toBe(1);
  });

  it("filters by skill when query param provided", async () => {
    // Profile lookup — from("profiles").select().eq().single()
    const profileChain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["select", "eq", "single"]) {
      profileChain[m] = vi.fn().mockReturnValue(profileChain);
    }
    profileChain.single.mockResolvedValue({
      data: { id: "user-456", skills: ["React"] },
      error: null,
    });

    // Endorsements query: from("endorsements").select().eq().eq().order()
    // With skill filter, there are two .eq() calls
    const endorsementChain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["select", "eq", "order"]) {
      endorsementChain[m] = vi.fn().mockReturnValue(endorsementChain);
    }
    endorsementChain.order.mockResolvedValue({
      data: [
        {
          id: "e1",
          endorser_id: "u1",
          endorsed_id: "user-456",
          skill: "React",
          comment: null,
          created_at: "2025-01-01T00:00:00Z",
          endorser: { id: "u1", username: "alice", full_name: "Alice", avatar_url: null },
        },
      ],
      error: null,
    });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === "profiles") return profileChain;
      return endorsementChain;
    });

    const res = await GET(makeRequest({ skill: "React" }), routeParams);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data[0].skill).toBe("React");
  });

  it("returns empty when no endorsements", async () => {
    const profileChain = chainResult({
      data: { id: "user-456", skills: ["React"] },
      error: null,
    });

    const endorsementChain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["select", "eq", "order"]) {
      endorsementChain[m] = vi.fn().mockReturnValue(endorsementChain);
    }
    endorsementChain.order.mockResolvedValue({
      data: [],
      error: null,
    });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? profileChain : endorsementChain;
    });

    const res = await GET(makeRequest(), routeParams);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(0);
    expect(json.total_endorsements).toBe(0);
  });
});
