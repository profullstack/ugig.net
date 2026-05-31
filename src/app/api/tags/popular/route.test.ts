import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const mockFrom = vi.fn();

const supabaseClient = {
  from: mockFrom,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseClient)),
}));

function makeRequest(limit: string) {
  return new NextRequest(`http://localhost/api/tags/popular?limit=${limit}`);
}

function setupTags(count: number) {
  const gigs = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: Array.from({ length: count }, (_, index) => ({
          skills_required: [`tag-${index}`],
        })),
        error: null,
      }),
    }),
  };
  const follows = {
    select: vi.fn().mockResolvedValue({ data: [], error: null }),
  };

  mockFrom.mockImplementation((table: string) =>
    table === "gigs" ? gigs : follows
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/tags/popular", () => {
  it("clamps zero limits to one tag", async () => {
    setupTags(3);

    const response = await GET(makeRequest("0"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tags).toHaveLength(1);
  });

  it("falls back from malformed limits", async () => {
    setupTags(55);

    const response = await GET(makeRequest("abc"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tags).toHaveLength(50);
  });

  it("caps oversized limits", async () => {
    setupTags(205);

    const response = await GET(makeRequest("999"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tags).toHaveLength(200);
  });
});
