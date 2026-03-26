import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

import { POST } from "./route";

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/cron/archive-conversations", {
    method: "POST",
    headers,
  });
}

function chainResult(result: {
  data: unknown;
  error: unknown;
  count?: number | null;
}) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of [
    "select",
    "eq",
    "is",
    "lt",
    "gte",
    "in",
    "update",
    "head",
  ]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // select() with count option returns { count }
  chain.gte.mockResolvedValue({ count: result.count ?? 0, error: null });
  // For the candidate query
  chain.lt.mockResolvedValue(result);
  // For the update
  chain.in.mockResolvedValue(result);
  return chain;
}

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "test-secret");
});

// ════════════════════════════════════════════════════════════════════
//  POST /api/cron/archive-conversations
// ════════════════════════════════════════════════════════════════════

describe("POST /api/cron/archive-conversations", () => {
  it("returns 401 without cron secret", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong cron secret", async () => {
    const res = await POST(makeRequest({ "x-cron-secret": "wrong" }));
    expect(res.status).toBe(401);
  });

  it("accepts x-cron-secret header", async () => {
    const chain = chainResult({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    const res = await POST(makeRequest({ "x-cron-secret": "test-secret" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.archived).toBe(0);
  });

  it("accepts Bearer authorization header", async () => {
    const chain = chainResult({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    const res = await POST(
      makeRequest({ authorization: "Bearer test-secret" })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.archived).toBe(0);
  });

  it("archives conversations with no recent messages", async () => {
    const candidates = [{ id: "conv-1" }, { id: "conv-2" }];

    // First call: select candidates
    const candidateChain = chainResult({
      data: candidates,
      error: null,
    });
    // Messages check: no recent messages (count=0)
    const msgChain = chainResult({ data: null, error: null, count: 0 });
    // Update chain
    const updateChain = chainResult({ data: null, error: null });

    let fromCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "conversations") {
        fromCallCount++;
        if (fromCallCount === 1) return candidateChain;
        return updateChain;
      }
      if (table === "messages") return msgChain;
      return chainResult({ data: null, error: null });
    });

    const res = await POST(
      makeRequest({ "x-cron-secret": "test-secret" })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.archived).toBe(2);
    expect(json.checked).toBe(2);
  });

  it("skips conversations that have recent messages", async () => {
    const candidates = [{ id: "conv-1" }];

    const candidateChain = chainResult({
      data: candidates,
      error: null,
    });
    // Messages check: has recent messages (count > 0)
    const msgChain = chainResult({ data: null, error: null, count: 3 });

    let fromCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "conversations") {
        fromCallCount++;
        if (fromCallCount === 1) return candidateChain;
        // Should never reach update
        return chainResult({ data: null, error: null });
      }
      if (table === "messages") return msgChain;
      return chainResult({ data: null, error: null });
    });

    const res = await POST(
      makeRequest({ "x-cron-secret": "test-secret" })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.archived).toBe(0);
    expect(json.checked).toBe(1);
  });

  it("handles null count gracefully (treats as 0)", async () => {
    const candidates = [{ id: "conv-1" }];

    const candidateChain = chainResult({
      data: candidates,
      error: null,
    });
    // count is null (supabase error edge case)
    const msgChain = chainResult({ data: null, error: null, count: null });
    // Make gte resolve with null count
    msgChain.gte = vi.fn().mockResolvedValue({ count: null, error: null });
    const updateChain = chainResult({ data: null, error: null });

    let fromCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "conversations") {
        fromCallCount++;
        if (fromCallCount === 1) return candidateChain;
        return updateChain;
      }
      if (table === "messages") return msgChain;
      return chainResult({ data: null, error: null });
    });

    const res = await POST(
      makeRequest({ "x-cron-secret": "test-secret" })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    // With (count ?? 0) === 0, null count means it gets archived
    expect(json.archived).toBe(1);
  });
});
