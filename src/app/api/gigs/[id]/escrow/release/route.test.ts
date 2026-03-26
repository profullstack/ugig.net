import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/coinpayportal", () => ({ releaseEscrow: vi.fn() }));
vi.mock("@/lib/reputation-hooks", () => ({
  getUserDid: vi.fn().mockResolvedValue(null),
  onGigCompleted: vi.fn(),
}));
vi.mock("@/lib/auth/get-user", () => ({ getAuthContext: vi.fn() }));

import { POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";

const GIG_ID = "c2c2c2c2-d3d3-e4e4-f5f5-a6a6a6a6a6a6";
const ESCROW_ID = "a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4";

function req(body?: unknown) {
  return { json: () => Promise.resolve(body) } as any;
}
const params = { params: Promise.resolve({ id: GIG_ID }) };

describe("POST /api/gigs/[id]/escrow/release", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 if not authenticated", async () => {
    (getAuthContext as any).mockResolvedValue(null);
    const res = await POST(req({ escrow_id: ESCROW_ID }), params);
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing escrow_id", async () => {
    (getAuthContext as any).mockResolvedValue({ user: { id: "u1" }, supabase: {} });
    const res = await POST(req({}), params);
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-uuid escrow_id", async () => {
    (getAuthContext as any).mockResolvedValue({ user: { id: "u1" }, supabase: {} });
    const res = await POST(req({ escrow_id: "not-valid" }), params);
    expect(res.status).toBe(400);
  });
});
