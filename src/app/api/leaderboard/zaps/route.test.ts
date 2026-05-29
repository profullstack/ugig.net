import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

import { GET } from "./route";

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/leaderboard/zaps");
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return new NextRequest(url, { method: "GET" });
}

function mockLeaderboardQuery() {
  const zaps = [
    { recipient_id: "user-1", sender_id: "sender-1", amount_sats: 100 },
    { recipient_id: "user-2", sender_id: "sender-2", amount_sats: 50 },
  ];

  mockFrom.mockImplementation((table: string) => {
    if (table === "zaps") {
      const query = {
        gte: vi.fn(() => query),
        then: (
          resolve: (value: { data: typeof zaps; error: null }) => void
        ) => resolve({ data: zaps, error: null }),
      };

      return {
        select: vi.fn(() => query),
      };
    }

    return {
      select: vi.fn(() => ({
        in: vi.fn(() =>
          Promise.resolve({
            data: [
              { id: "user-1", username: "one", full_name: "User One", avatar_url: null },
              { id: "user-2", username: "two", full_name: "User Two", avatar_url: null },
            ],
          })
        ),
      })),
    };
  });
}

describe("GET /api/leaderboard/zaps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clamps negative limits to one row", async () => {
    mockLeaderboardQuery();

    const response = await GET(makeRequest({ limit: "-5" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.leaderboard).toHaveLength(1);
    expect(json.leaderboard[0].user.id).toBe("user-1");
  });

  it("falls back to the default limit for non-numeric values", async () => {
    mockLeaderboardQuery();

    const response = await GET(makeRequest({ limit: "abc" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.leaderboard).toHaveLength(2);
  });
});
