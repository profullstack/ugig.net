import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

// ── Mocks ──────────────────────────────────────────────────────────

const mockFrom = vi.fn();

const supabaseClient = {
  from: mockFrom,
  // users_are_blocked — nobody is blocked in these fixtures.
  rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
};

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
  createServiceClient: vi.fn(() => ({
    auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: null }) } },
  })),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  rateLimitExceeded: vi.fn(),
  getRateLimitIdentifier: vi.fn(() => "test"),
}));

vi.mock("@/lib/reputation-hooks", () => ({
  getUserDid: vi.fn().mockResolvedValue(null),
  onApplicationSubmitted: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  newApplicationEmail: vi.fn(() => ({ subject: "test", text: "test", html: "test" })),
}));

vi.mock("@/lib/webhooks/dispatch", () => ({
  dispatchWebhookAsync: vi.fn(),
}));

vi.mock("@/lib/activity", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

import { getAuthContext } from "@/lib/auth/get-user";
const mockGetAuthContext = vi.mocked(getAuthContext);

type MockAuthContext = any;

const GIG_ID = "00000000-0000-4000-a000-000000000001";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockChain() {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "update", "insert", "eq", "single", "contains", "order"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────

describe("POST /api/applications - re-apply after withdrawal", () => {
  it("re-activates a withdrawn application instead of blocking (regression)", async () => {
    // Regression for the ugig bug where a withdrawn application still counted
    // as "already applied", so the applicant could never re-apply and was
    // therefore blocked from ever invoicing merged work.
    const insertCalls: unknown[] = [];
    const updateCalls: Record<string, unknown>[] = [];
    const applicationsCalls: string[] = [];

    mockFrom.mockImplementation((table: string) => {
      const chain = mockChain();

      if (table === "gigs") {
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: {
            poster_id: "poster-1",
            status: "active",
            title: "Test Gig",
            poster: { full_name: "Poster" },
          },
          error: null,
        });
      } else if (table === "applications") {
        applicationsCalls.push(table);
        if (applicationsCalls.length === 1) {
          // Existing-application lookup: a WITHDRAWN application exists.
          (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
            data: { id: "app-existing", status: "withdrawn" },
            error: null,
          });
        } else {
          // Re-activation path: must UPDATE, never INSERT.
          (chain.update as ReturnType<typeof vi.fn>).mockImplementation(
            (payload: Record<string, unknown>) => {
              updateCalls.push(payload);
              return chain;
            }
          );
          (chain.insert as ReturnType<typeof vi.fn>).mockImplementation((payload: unknown) => {
            insertCalls.push(payload);
            return chain;
          });
          (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
            data: { id: "app-existing", gig_id: GIG_ID, applicant_id: "user-1", status: "pending" },
            error: null,
          });
        }
      } else if (table === "profiles") {
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: { full_name: "Applicant", username: "applicant" },
          error: null,
        });
      }
      return chain;
    });

    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "api_key" },
      supabase: supabaseClient,
    } as MockAuthContext);

    const req = makeRequest({ gig_id: GIG_ID, cover_letter: "x".repeat(60) });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.application.id).toBe("app-existing");
    // The withdrawn row is reused (updated back to pending), not duplicated.
    expect(insertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].status).toBe("pending");
  });

  it("still blocks re-applying when an active (pending) application exists", async () => {
    mockFrom.mockImplementation((table: string) => {
      const chain = mockChain();
      if (table === "gigs") {
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: {
            poster_id: "poster-1",
            status: "active",
            title: "Test Gig",
            poster: { full_name: "Poster" },
          },
          error: null,
        });
      } else if (table === "applications") {
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: { id: "app-existing", status: "pending" },
          error: null,
        });
      }
      return chain;
    });

    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-1", authMethod: "api_key" },
      supabase: supabaseClient,
    } as MockAuthContext);

    const req = makeRequest({ gig_id: GIG_ID, cover_letter: "x".repeat(60) });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("already applied");
  });
});
