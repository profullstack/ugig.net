import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

import { POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";

const params = { params: Promise.resolve({ id: "gig-1" }) };

beforeEach(() => vi.clearAllMocks());

describe("POST /api/gigs/[id]/applications/approve-all", () => {
  it("never approves applications held for spam review", async () => {
    const calls: [string, unknown[]][] = [];
    mockFrom.mockImplementation((table: string) => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      for (const m of ["select", "eq", "update", "is", "single"]) {
        chain[m] = vi.fn((...args: unknown[]) => {
          if (table === "applications") calls.push([m, args]);
          return chain;
        });
      }
      if (table === "gigs") {
        chain.single.mockResolvedValue({ data: { poster_id: "owner-1" }, error: null });
      } else {
        chain.select.mockResolvedValue({ data: [{ id: "a1" }], error: null });
      }
      return chain;
    });
    vi.mocked(getAuthContext).mockResolvedValue({ user: { id: "owner-1" }, supabase: {} } as never);

    const res = await POST(new NextRequest("http://localhost/x", { method: "POST" }), params);
    expect(res.status).toBe(200);
    expect(calls).toContainEqual(["is", ["metadata->>held", null]]);
    expect(calls).toContainEqual(["eq", ["status", "pending"]]);
  });
});
