import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockFrom = vi.fn();

const supabaseClient = {
  from: mockFrom,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseClient)),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => supabaseClient),
}));

vi.mock("@/lib/prompts/security-scan", () => ({
  scanPrompt: vi.fn(),
}));

import { GET } from "./route";

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/prompts");
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return new NextRequest(url, { method: "GET" });
}

function makePromptQuery() {
  const range = vi.fn().mockResolvedValue({ data: [], count: 0, error: null });
  const order = vi.fn().mockReturnValue({ range });
  const overlaps = vi.fn().mockReturnValue({ order });
  const eqAfterSearch = vi.fn().mockReturnValue({ order });
  const or = vi.fn().mockReturnValue({ eq: eqAfterSearch, overlaps, order });
  const eq = vi.fn().mockReturnValue({ or, eq: eqAfterSearch, overlaps, order });
  const select = vi.fn().mockReturnValue({ eq });

  return { select, eq, or, eqAfterSearch, overlaps, order, range };
}

describe("GET /api/prompts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("escapes PostgREST filter characters in search terms", async () => {
    const query = makePromptQuery();
    mockFrom.mockReturnValue(query);

    const response = await GET(makeGetRequest({ search: "ai%,foo_(v1)." }));

    expect(response.status).toBe(200);
    expect(query.or).toHaveBeenCalledWith(
      "title.ilike.%ai\\%\\,foo\\_\\(v1\\)\\.%,description.ilike.%ai\\%\\,foo\\_\\(v1\\)\\.%,tagline.ilike.%ai\\%\\,foo\\_\\(v1\\)\\.%"
    );
  });
});
