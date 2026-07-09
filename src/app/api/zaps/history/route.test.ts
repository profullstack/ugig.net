import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
}));

const mockGetAuthContext = vi.mocked(getAuthContext);
const mockCreateServiceClient = vi.mocked(createServiceClient);

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/zaps/history");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

async function expectZapRange(
  input: Record<string, string>,
  expectedFrom: number,
  expectedTo: number
) {
  const range = vi.fn().mockResolvedValue({
    data: [],
    count: 0,
  });
  const order = vi.fn().mockReturnValue({ range });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  mockGetAuthContext.mockResolvedValue({
    user: { id: "user-1", authMethod: "session" },
    supabase: {},
  } as any);
  mockCreateServiceClient.mockReturnValue({ from } as any);

  const response = await GET(makeRequest(input));
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(range).toHaveBeenCalledWith(expectedFrom, expectedTo);
  expect(body).toEqual({ zaps: [], total: 0 });
}

describe("GET /api/zaps/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
  });

  it("defaults partial numeric pagination params before querying", async () => {
    await expectZapRange({ offset: "10abc", limit: "5wat" }, 0, 49);
  });

  it("keeps valid pagination params", async () => {
    await expectZapRange({ offset: "10", limit: "5" }, 10, 14);
  });
});
