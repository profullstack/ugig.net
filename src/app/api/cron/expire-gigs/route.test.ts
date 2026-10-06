import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockExpireGigs } = vi.hoisted(() => ({ mockExpireGigs: vi.fn() }));
vi.mock("@/lib/gigs/expire-gigs", () => ({ expireGigs: mockExpireGigs }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn(() => ({ fake: true })) }));

import { POST } from "./route";

function makeRequest(headers: Record<string, string> = {}, query = "") {
  return new NextRequest(`http://localhost/api/cron/expire-gigs${query}`, { method: "POST", headers });
}

const RESULT = { dry_run: false, found: 2, paused: 2, emailed: 2, email_skipped: 0, email_failed: 0, gigs: [] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "test-secret");
  mockExpireGigs.mockResolvedValue(RESULT);
});

describe("POST /api/cron/expire-gigs", () => {
  it("returns 401 without the cron secret", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(mockExpireGigs).not.toHaveBeenCalled();
  });

  it("returns 401 with a wrong secret", async () => {
    const res = await POST(makeRequest({ "x-cron-secret": "nope" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when CRON_SECRET is unset, even for an empty header", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await POST(makeRequest({ "x-cron-secret": "" }));
    expect(res.status).toBe(401);
  });

  it("runs with x-cron-secret", async () => {
    const res = await POST(makeRequest({ "x-cron-secret": "test-secret" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RESULT);
    expect(mockExpireGigs).toHaveBeenCalledWith({ fake: true }, { dryRun: false });
  });

  it("accepts Authorization: Bearer and passes dry_run=1 through", async () => {
    const res = await POST(makeRequest({ authorization: "Bearer test-secret" }, "?dry_run=1"));
    expect(res.status).toBe(200);
    expect(mockExpireGigs).toHaveBeenCalledWith({ fake: true }, { dryRun: true });
  });

  it("returns 500 when the run throws", async () => {
    mockExpireGigs.mockRejectedValue(new Error("db down"));
    const res = await POST(makeRequest({ "x-cron-secret": "test-secret" }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("db down");
  });
});
