import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

const mockGetAuthContext = vi.mocked(getAuthContext);

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/notifications");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

async function expectNotificationRange(
  input: Record<string, string>,
  expectedFrom: number,
  expectedTo: number
) {
  const activeAtThen = vi.fn((resolve: () => void) => resolve());
  const activeAtEq = vi.fn().mockReturnValue({ then: activeAtThen });
  const profileUpdate = vi.fn().mockReturnValue({ eq: activeAtEq });

  const range = vi.fn().mockResolvedValue({
    data: [],
    error: null,
    count: 0,
  });
  const order = vi.fn().mockReturnValue({ range });
  const notificationEq = vi.fn().mockReturnValue({ order });
  const notificationSelect = vi.fn().mockReturnValue({ eq: notificationEq });

  const unreadIs = vi.fn().mockResolvedValue({ count: 0 });
  const unreadEq = vi.fn().mockReturnValue({ is: unreadIs });
  const unreadSelect = vi.fn().mockReturnValue({ eq: unreadEq });

  const from = vi
    .fn()
    .mockReturnValueOnce({ update: profileUpdate })
    .mockReturnValueOnce({ select: notificationSelect })
    .mockReturnValueOnce({ select: unreadSelect });

  mockGetAuthContext.mockResolvedValue({
    user: { id: "user-1", authMethod: "session" },
    supabase: { from },
  } as any);

  const response = await GET(makeRequest(input));
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(range).toHaveBeenCalledWith(expectedFrom, expectedTo);
  expect(body.pagination.offset).toBe(expectedFrom);
}

describe("GET /api/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
  });

  it("defaults malformed offsets to zero", async () => {
    await expectNotificationRange({ offset: "abc" }, 0, 49);
  });

  it("clamps negative offsets to zero", async () => {
    await expectNotificationRange({ offset: "-50", limit: "10" }, 0, 9);
  });

  it("caps huge offsets before building the Supabase range", async () => {
    await expectNotificationRange(
      { offset: "999999999", limit: "25" },
      100000,
      100024
    );
  });
});
