import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  admin: {},
  createServiceClient: vi.fn(),
  settleCommissions: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.createServiceClient,
}));

vi.mock("@/lib/affiliates/commission", () => ({
  settleCommissions: mocks.settleCommissions,
}));

import { POST } from "./route";

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/affiliates/settle", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "test-secret");
  mocks.createServiceClient.mockReturnValue(mocks.admin);
  mocks.settleCommissions.mockResolvedValue({
    settled: 2,
    failed: 0,
    total_sats: 1500,
  });
});

describe("POST /api/affiliates/settle", () => {
  it("rejects requests when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const res = await POST(makeRequest({ authorization: "Bearer test-secret" }));

    expect(res.status).toBe(401);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
    expect(mocks.settleCommissions).not.toHaveBeenCalled();
  });

  it("rejects requests without the bearer cron secret", async () => {
    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
    expect(mocks.settleCommissions).not.toHaveBeenCalled();
  });

  it("settles commissions with the configured bearer cron secret", async () => {
    const res = await POST(makeRequest({ authorization: "Bearer test-secret" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ settled: 2, failed: 0, total_sats: 1500 });
    expect(mocks.createServiceClient).toHaveBeenCalledOnce();
    expect(mocks.settleCommissions).toHaveBeenCalledWith(mocks.admin, {
      limit: 100,
    });
  });
});
