import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn(() => ({ rpc: mockRpc })) }));

import { POST } from "./route";

function makeRequest(headers: Record<string, string> = {}, query = "") {
  return new NextRequest(`http://localhost/api/cron/archive-stale${query}`, { method: "POST", headers });
}

const RESULT = { dry_run: false, gigs: 3, applications: 7, by_reason: { "gig:stale": 3, "application:stale": 7 } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "test-secret");
  mockRpc.mockResolvedValue({ data: RESULT, error: null });
});

describe("POST /api/cron/archive-stale", () => {
  it("returns 401 without the cron secret", async () => {
    expect((await POST(makeRequest())).status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET is unset, even for an empty header", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await POST(makeRequest({ "x-cron-secret": "" }))).status).toBe(401);
  });

  it("archives with x-cron-secret and returns the counts", async () => {
    const res = await POST(makeRequest({ "x-cron-secret": "test-secret" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RESULT);
    expect(mockRpc).toHaveBeenCalledWith("archive_stale_content", { p_dry_run: false });
  });

  it("accepts a Bearer token", async () => {
    const res = await POST(makeRequest({ authorization: "Bearer test-secret" }));
    expect(res.status).toBe(200);
  });

  it("passes dry_run=1 through", async () => {
    await POST(makeRequest({ "x-cron-secret": "test-secret" }, "?dry_run=1"));
    expect(mockRpc).toHaveBeenCalledWith("archive_stale_content", { p_dry_run: true });
  });

  it("returns 500 when the database refuses", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    const res = await POST(makeRequest({ "x-cron-secret": "test-secret" }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/does not exist/);
  });
});
