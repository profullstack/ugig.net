import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const svc = { tag: "service-client" };
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => svc),
}));

vi.mock("@/lib/application-emails", () => ({
  runApplicationDigest: vi.fn(),
}));

import { POST } from "./route";
import { runApplicationDigest } from "@/lib/application-emails";
const mockRun = vi.mocked(runApplicationDigest);

function makeRequest(headers: Record<string, string> = {}, query = "") {
  return new NextRequest(`http://localhost/api/cron/application-digest${query}`, {
    method: "POST",
    headers,
  });
}

const sample = {
  dry_run: false,
  window_start: "2026-10-05T08:00:00.000Z",
  window_end: "2026-10-06T08:00:00.000Z",
  posters: [{ poster_id: "p1", gigs: 1, applications: 3, outcome: "sent" as const }],
  totals: { applications: 3, posters: 1, sent: 1, would_send: 0, skipped: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "cron-test-secret");
  mockRun.mockResolvedValue(sample);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/cron/application-digest", () => {
  it("returns 401 without the cron secret", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("returns 401 with a wrong secret", async () => {
    const res = await POST(makeRequest({ "x-cron-secret": "nope" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await POST(makeRequest({ "x-cron-secret": "" }));
    expect(res.status).toBe(401);
  });

  it("runs the digest for real with x-cron-secret", async () => {
    const res = await POST(makeRequest({ "x-cron-secret": "cron-test-secret" }));
    expect(res.status).toBe(200);
    expect(mockRun).toHaveBeenCalledWith(svc, { dryRun: false });
    expect(await res.json()).toEqual(sample);
  });

  it("accepts Authorization: Bearer and passes ?dry_run=1 through", async () => {
    mockRun.mockResolvedValue({ ...sample, dry_run: true });
    const res = await POST(makeRequest({ authorization: "Bearer cron-test-secret" }, "?dry_run=1"));
    expect(res.status).toBe(200);
    expect(mockRun).toHaveBeenCalledWith(svc, { dryRun: true });
    expect((await res.json()).dry_run).toBe(true);
  });

  it("returns 500 when the digest fails", async () => {
    mockRun.mockRejectedValue(new Error("applications query failed: boom"));
    const res = await POST(makeRequest({ "x-cron-secret": "cron-test-secret" }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("boom");
  });
});
