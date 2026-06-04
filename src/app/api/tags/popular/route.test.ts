import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}));

import { GET } from "./route";

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/tags/popular");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url, { method: "GET" });
}

function mockPopularTagsData() {
  const gigs = [
    { skills_required: ["TypeScript", "API"] },
    { skills_required: ["TypeScript", "Testing"] },
    { skills_required: ["Python"] },
  ];
  const follows = [
    { tag: "TypeScript" },
    { tag: "API" },
    { tag: "API" },
  ];

  mockFrom.mockImplementation((table: string) => {
    if (table === "gigs") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: gigs, error: null })),
        })),
      };
    }

    if (table === "tag_follows") {
      return {
        select: vi.fn(() => Promise.resolve({ data: follows, error: null })),
      };
    }

    return {};
  });
}

describe("GET /api/tags/popular", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clamps zero limits to one tag", async () => {
    mockPopularTagsData();

    const response = await GET(makeRequest({ limit: "0" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.tags).toHaveLength(1);
    expect(json.tags[0].tag).toBe("API");
  });

  it("uses the default limit for malformed numeric strings", async () => {
    mockPopularTagsData();

    const response = await GET(makeRequest({ limit: "7px" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.tags).toHaveLength(4);
  });
});
