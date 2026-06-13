import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
  createServiceClient: vi.fn(),
}));

import { GET } from "./route";

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/directory");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

function chainResult(result: {
  data: unknown;
  error: unknown;
  count?: number | null;
}) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "or", "overlaps", "order"]) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.range = vi.fn().mockResolvedValue(result);
  return chain;
}

describe("GET /api/directory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("escapes PostgREST filter punctuation in search", async () => {
    const chain = chainResult({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    const res = await GET(makeRequest({ search: "100%_demo,(v1.2)*" }));

    expect(res.status).toBe(200);
    expect(chain.or).toHaveBeenCalledWith(
      "title.ilike.%100\\%\\_demo\\,\\(v1\\.2\\)\\*%,description.ilike.%100\\%\\_demo\\,\\(v1\\.2\\)\\*%"
    );
  });
});
