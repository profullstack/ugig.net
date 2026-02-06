import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PUT } from "./route";

// ── Mocks ──────────────────────────────────────────────────────────

const mockFrom = vi.fn();

const supabaseClient = {
  from: mockFrom,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseClient)),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

import { getAuthContext } from "@/lib/auth/get-user";
const mockGetAuthContext = vi.mocked(getAuthContext);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockAuthContext = any;

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>) {
  const url = "http://localhost/api/applications/test-app-id/status";
  return new NextRequest(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const routeParams = { params: Promise.resolve({ id: "test-app-id" }) };

/** Build a chain-able Supabase query mock that resolves to `result`. */
function chainResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "update", "insert", "eq", "single"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  return chain;
}

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════
//  PUT /api/applications/[id]/status
// ════════════════════════════════════════════════════════════════════

describe("PUT /api/applications/[id]/status", () => {
  const mockApplication = {
    id: "test-app-id",
    gig_id: "test-gig-id",
    applicant_id: "applicant-user-id",
    status: "pending",
  };

  const mockGig = {
    id: "test-gig-id",
    title: "Test Gig",
    poster_id: "poster-user-id",
    poster: { full_name: "Test Poster", username: "testposter" },
  };

  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await PUT(makeRequest({ status: "accepted" }), routeParams);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 400 for invalid status", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "poster-user-id", authMethod: "session" },
      supabase: supabaseClient,
    } as MockAuthContext);

    const res = await PUT(makeRequest({ status: "invalid_status" }), routeParams);
    const json = await res.json();

    expect(res.status).toBe(400);
  });

  it("returns 404 when application not found", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "poster-user-id", authMethod: "session" },
      supabase: supabaseClient,
    } as MockAuthContext);

    const appChain = chainResult({ data: null, error: { code: "PGRST116", message: "not found" } });
    mockFrom.mockReturnValue(appChain);

    const res = await PUT(makeRequest({ status: "accepted" }), routeParams);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Application not found");
  });

  it("allows poster to accept application", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "poster-user-id", authMethod: "session" },
      supabase: supabaseClient,
    } as MockAuthContext);

    // Call sequence: applications select, gigs select, applications update, notifications insert
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (callCount === 1) {
        // applications select
        return chainResult({ data: mockApplication, error: null });
      } else if (callCount === 2) {
        // gigs select
        return chainResult({ data: mockGig, error: null });
      } else if (callCount === 3) {
        // applications update
        return chainResult({ data: { ...mockApplication, status: "accepted" }, error: null });
      } else {
        // notifications insert
        const chain = chainResult({ data: null, error: null });
        return chain;
      }
    });

    const res = await PUT(makeRequest({ status: "accepted" }), routeParams);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.application.status).toBe("accepted");
  });

  it("allows poster to reject application", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "poster-user-id", authMethod: "session" },
      supabase: supabaseClient,
    } as MockAuthContext);

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return chainResult({ data: mockApplication, error: null });
      } else if (callCount === 2) {
        return chainResult({ data: mockGig, error: null });
      } else if (callCount === 3) {
        return chainResult({ data: { ...mockApplication, status: "rejected" }, error: null });
      } else {
        return chainResult({ data: null, error: null });
      }
    });

    const res = await PUT(makeRequest({ status: "rejected" }), routeParams);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.application.status).toBe("rejected");
  });

  it("allows applicant to withdraw their application", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "applicant-user-id", authMethod: "session" },
      supabase: supabaseClient,
    } as MockAuthContext);

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return chainResult({ data: mockApplication, error: null });
      } else if (callCount === 2) {
        return chainResult({ data: mockGig, error: null });
      } else {
        return chainResult({ data: { ...mockApplication, status: "withdrawn" }, error: null });
      }
    });

    const res = await PUT(makeRequest({ status: "withdrawn" }), routeParams);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.application.status).toBe("withdrawn");
  });

  it("prevents applicant from accepting their own application", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "applicant-user-id", authMethod: "session" },
      supabase: supabaseClient,
    } as MockAuthContext);

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return chainResult({ data: mockApplication, error: null });
      } else {
        return chainResult({ data: mockGig, error: null });
      }
    });

    const res = await PUT(makeRequest({ status: "accepted" }), routeParams);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe("You can only withdraw your application");
  });

  it("prevents random user from changing application status", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "random-user-id", authMethod: "session" },
      supabase: supabaseClient,
    } as MockAuthContext);

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return chainResult({ data: mockApplication, error: null });
      } else {
        return chainResult({ data: mockGig, error: null });
      }
    });

    const res = await PUT(makeRequest({ status: "accepted" }), routeParams);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe("Forbidden");
  });

  it("creates notification when poster changes status", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "poster-user-id", authMethod: "session" },
      supabase: supabaseClient,
    } as MockAuthContext);

    const notificationInsert = vi.fn().mockReturnValue(chainResult({ data: null, error: null }));
    
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (callCount === 1) {
        return chainResult({ data: mockApplication, error: null });
      } else if (callCount === 2) {
        return chainResult({ data: mockGig, error: null });
      } else if (callCount === 3) {
        return chainResult({ data: { ...mockApplication, status: "accepted" }, error: null });
      } else if (table === "notifications") {
        return { insert: notificationInsert };
      }
      return chainResult({ data: null, error: null });
    });

    await PUT(makeRequest({ status: "accepted" }), routeParams);

    // Verify notifications table was accessed
    expect(mockFrom).toHaveBeenCalledWith("notifications");
  });

  it("handles update errors gracefully", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "poster-user-id", authMethod: "session" },
      supabase: supabaseClient,
    } as MockAuthContext);

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return chainResult({ data: mockApplication, error: null });
      } else if (callCount === 2) {
        return chainResult({ data: mockGig, error: null });
      } else {
        return chainResult({ data: null, error: { message: "Database error" } });
      }
    });

    const res = await PUT(makeRequest({ status: "accepted" }), routeParams);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Database error");
  });

  it("allows shortlisting an application", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "poster-user-id", authMethod: "session" },
      supabase: supabaseClient,
    } as MockAuthContext);

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return chainResult({ data: mockApplication, error: null });
      } else if (callCount === 2) {
        return chainResult({ data: mockGig, error: null });
      } else if (callCount === 3) {
        return chainResult({ data: { ...mockApplication, status: "shortlisted" }, error: null });
      } else {
        return chainResult({ data: null, error: null });
      }
    });

    const res = await PUT(makeRequest({ status: "shortlisted" }), routeParams);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.application.status).toBe("shortlisted");
  });

  it("allows marking application as reviewing", async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: "poster-user-id", authMethod: "session" },
      supabase: supabaseClient,
    } as MockAuthContext);

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return chainResult({ data: mockApplication, error: null });
      } else if (callCount === 2) {
        return chainResult({ data: mockGig, error: null });
      } else if (callCount === 3) {
        return chainResult({ data: { ...mockApplication, status: "reviewing" }, error: null });
      } else {
        return chainResult({ data: null, error: null });
      }
    });

    const res = await PUT(makeRequest({ status: "reviewing" }), routeParams);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.application.status).toBe("reviewing");
  });
});
